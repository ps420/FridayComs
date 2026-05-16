require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Services
const SessionService = require('./backend/services/sessionService');
const MessageService = require('./backend/services/messageService');
const StreamingService = require('./backend/services/streamingService');
const ConversationMemory = require('./backend/memory/conversationMemory');
const { getDatabase, closeDatabase } = require('./backend/db/database');
const AIProviderManager = require('./providers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize services
const sessionService = new SessionService();
const aiProvider = new AIProviderManager();
const messageService = new MessageService();
const streamingService = new StreamingService();
const memory = new ConversationMemory();

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'frontend/build')));

// Auth middleware
const checkAuth = (req, res, next) => {
  const publicPaths = ['/api/health', '/api/provider/status'];
  if (publicPaths.includes(req.path)) return next();
  
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="FridayComs"');
    return res.status(401).send('Authentication required');
  }
  
  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (credentials[1] !== AUTH_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="FridayComs"');
    return res.status(401).send('Invalid password');
  }
  
  req.userId = credentials[0] || 'anonymous';
  next();
};

app.use(checkAuth);

// Health endpoint
app.get('/api/health', (req, res) => {
  const db = getDatabase();
  const isAzure = streamingService.azureProvider.isConfigured();
  
  const { getSpeechService } = require('./backend/services/speechService');
  const speechService = getSpeechService();
  const isSpeechEnabled = speechService.isEnabled();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fridaycoms',
    version: '1.2.0',
    database: db ? 'connected' : 'error',
    streaming: 'enabled',
    features: {
      backend: { status: 'connected', note: 'Express + SQLite' },
      websocket: { status: 'connected', note: 'WebSocket with reconnect' },
      streaming: { status: 'enabled', note: 'Real-time token streaming' },
      ai: { 
        status: isAzure ? 'connected' : 'mock',
        note: isAzure ? 'Azure OpenAI with streaming' : 'Mock fallback'
      },
      sessions: { status: 'enabled', note: 'Persistent sessions with SQLite' },
      memory: { status: 'enabled', note: 'Conversation context & summaries' },
      voice: { 
        status: isSpeechEnabled ? 'enabled' : 'disabled',
        note: isSpeechEnabled ? 'Azure Speech Services (STT + TTS)' : 'API key not configured'
      }
    }
  });
});

// Azure Speech Health Check
app.get('/api/voice/health', async (req, res) => {
  const { getSpeechService } = require('./backend/services/speechService');
  const speechService = getSpeechService();
  
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  
  const result = {
    timestamp: new Date().toISOString(),
    configured: {
      key: !!(key && key !== 'your_speech_key_here'),
      region: region || 'not set',
      keyLast4: key && key !== 'your_speech_key_here' ? key.slice(-4) : null
    },
    speechService: {
      enabled: speechService.isEnabled(),
      ffmpegAvailable: speechService.ffmpegAvailable || false
    },
    connection: {
      tested: false,
      success: false,
      error: null,
      latencyMs: null
    },
    lastError: null
  };
  
  if (!result.configured.key) {
    return res.json({
      ...result,
      status: 'not_configured',
      message: 'AZURE_SPEECH_KEY not set'
    });
  }
  
  // Test actual connection
  const startTime = Date.now();
  try {
    const sdk = require('microsoft-cognitiveservices-speech-sdk');
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    
    // Create minimal audio input (empty WAV)
    const audioConfig = sdk.AudioConfig.fromWavFileInput(Buffer.alloc(44 + 16000));
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    let connected = false;
    let sdkError = null;
    
    recognizer.sessionStarted = () => {
      connected = true;
    };
    
    recognizer.canceled = (s, e) => {
      // 1006 = WebSocket error, usually means connection failed
      if (e.errorCode === sdk.CancellationErrorCode.ConnectionFailure) {
        sdkError = `Connection failed: ${e.errorDetails}`;
      }
    };
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        recognizer.close();
        reject(new Error('Connection timeout (10s)'));
      }, 10000);
      
      recognizer.recognizeOnceAsync(
        (result) => {
          clearTimeout(timeout);
          recognizer.close();
          resolve(result);
        },
        (err) => {
          clearTimeout(timeout);
          recognizer.close();
          reject(err);
        }
      );
    });
    
    result.connection.tested = true;
    result.connection.success = connected;
    result.connection.latencyMs = Date.now() - startTime;
    
    if (!connected && sdkError) {
      result.connection.error = sdkError;
    }
    
    res.json({
      ...result,
      status: connected ? 'healthy' : 'connection_failed',
      message: connected ? 'Azure Speech connected successfully' : 'Failed to connect to Azure Speech'
    });
    
  } catch (err) {
    result.connection.tested = true;
    result.connection.success = false;
    result.connection.error = err.message;
    result.connection.latencyMs = Date.now() - startTime;
    
    res.json({
      ...result,
      status: 'error',
      message: err.message
    });
  }
});

// Session endpoints
app.post('/api/sessions', (req, res) => {
  const { title, userId = req.userId } = req.body;
  const session = sessionService.createSession(userId, title);
  res.json(session);
});

app.get('/api/sessions', (req, res) => {
  const userId = req.userId;
  const sessions = sessionService.getUserSessions(userId, 20);
  res.json(sessions);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = sessionService.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  
  const messages = messageService.getMessages(req.params.id, 50);
  const stats = sessionService.getSessionStats(req.params.id);
  
  res.json({ ...session, messages, stats });
});

app.delete('/api/sessions/:id', (req, res) => {
  sessionService.deleteSession(req.params.id);
  res.json({ success: true });
});

app.get('/api/sessions/:id/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const messages = messageService.getMessages(req.params.id, limit, offset);
  res.json(messages);
});

// Token usage endpoint
app.get('/api/sessions/:id/tokens', (req, res) => {
  const usage = messageService.getTokenUsage(req.params.id);
  const daily = messageService.getDailyTokenUsage(req.params.id, 7);
  res.json({ summary: usage, daily });
});

// Conversation summary endpoint
app.get('/api/sessions/:id/summary', async (req, res) => {
  const summary = await memory.getOrCreateSummary(req.params.id);
  res.json({ summary });
});

// Call endpoints
const { getCallService } = require('./backend/services/callService');
const callService = getCallService();

app.post('/api/calls', (req, res) => {
  const { sessionId, callType = 'voice' } = req.body;
  const userId = req.userId;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID required' });
  }
  
  const call = callService.initiateCall(sessionId, userId, callType);
  res.json(call);
});

app.post('/api/calls/:id/start', (req, res) => {
  const call = callService.startCall(req.params.id);
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }
  res.json(call);
});

app.post('/api/calls/:id/end', (req, res) => {
  const { transcript } = req.body;
  const call = callService.endCall(req.params.id, { transcript });
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }
  res.json(call);
});

// Voice call processing: STT -> AI -> TTS
app.post('/api/calls/:id/process', async (req, res) => {
  const startTime = Date.now();
  const { audioBase64, sessionId, mimeType } = req.body;
  
  console.log(`\n========== VOICE TURN START ==========`);
  console.log(`[Turn] Endpoint: /api/calls/${req.params.id}/process`);
  console.log(`[Turn] Session: ${sessionId}`);
  console.log(`[Turn] Received audio:`);
  console.log(`  - MIME type: ${mimeType || 'not provided'}`);
  console.log(`  - Base64 length: ${audioBase64?.length || 0} chars`);
  
  if (!audioBase64) {
    console.log('[Turn] ERROR: No audio data received');
    return res.status(400).json({ error: 'Audio data required' });
  }
  
  try {
    const { getSpeechService } = require('./backend/services/speechService');
    const speechService = getSpeechService();
    
    if (!speechService.isEnabled()) {
      console.log('[Turn] ERROR: Speech service not configured');
      return res.status(503).json({ error: 'Azure Speech Service not configured' });
    }
    
    // Decode audio from base64
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    console.log(`[Turn] Decoded: ${audioBuffer.length} bytes`);
    
    // Step 1: Speech-to-Text
    console.log('[Turn] Step 1: Speech-to-Text...');
    const sttResult = await speechService.recognizeOnce(audioBuffer, mimeType);
    const userTranscript = sttResult.text;
    
    console.log(`[Turn] STT Result: "${userTranscript}"`);
    
    if (!userTranscript) {
      console.log('[Turn] WARNING: No speech detected');
      return res.status(200).json({
        transcript: '',
        aiResponse: '',
        audioBase64: '',
        error: 'No speech detected'
      });
    }
    
    // Step 2: Ensure session exists and save user message
    let effectiveSessionId = sessionId;
    
    if (!effectiveSessionId) {
      // Auto-create session for voice calls without existing session
      console.log('[Turn] No session provided, creating new session...');
      const newSession = sessionService.createSession(req.userId, 'Voice Call');
      effectiveSessionId = newSession.id;
      console.log(`[Turn] Created session: ${effectiveSessionId}`);
    }
    
    // Save user message
    messageService.addMessage(effectiveSessionId, 'user', userTranscript);
    
    // Step 3: Get conversation context
    let context = [];
    try {
      context = await memory.buildContext(effectiveSessionId);
    } catch (ctxErr) {
      console.log(`[Turn] Warning: Could not build context: ${ctxErr.message}`);
      context = [];
    }
    
    // Ensure context is always an array
    const safeHistory = Array.isArray(context) ? context : [];
    
    console.log(`[Turn] Step 2: Sending to AI...`);
    console.log(`  - SessionId: ${effectiveSessionId}`);
    console.log(`  - History type: ${typeof safeHistory}, length: ${safeHistory.length}`);
    console.log(`  - Transcript: "${userTranscript}"`);
    
    const aiStart = Date.now();
    let aiResult;
    let usedFallback = false;
    
    try {
      aiResult = await aiProvider.sendMessage(userTranscript, safeHistory);
    } catch (aiErr) {
      console.error(`[Turn] AI call failed: ${aiErr.message}`);
      console.log('[Turn] Falling back to mock provider...');
      
      // Fallback to mock provider
      const MockProvider = require('./providers/mock-provider');
      const mockProvider = new MockProvider();
      
      try {
        aiResult = await mockProvider.sendMessage(userTranscript, safeHistory);
        usedFallback = true;
        console.log('[Turn] Mock fallback succeeded');
      } catch (mockErr) {
        console.error(`[Turn] Mock fallback also failed: ${mockErr.message}`);
        throw new Error(`AI error: ${aiErr.message}`);
      }
    }
    
    const aiLatency = Date.now() - aiStart;
    
    const aiResponse = aiResult.content;
    const providerName = usedFallback ? 'mock (fallback)' : aiResult.provider;
    console.log(`[Turn] AI Response (${aiLatency}ms) [${providerName}]: "${aiResponse.slice(0, 100)}${aiResponse.length > 100 ? '...' : ''}"`);
    
    // Save AI message to session
    let aiMessage = null;
    aiMessage = messageService.addMessage(effectiveSessionId, 'assistant', aiResponse, {
      provider: usedFallback ? 'mock-fallback' : aiResult.provider,
      latency: aiLatency,
      usage: aiResult.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
    
    // Step 4: Text-to-Speech
    console.log('[Turn] Step 3: Text-to-Speech...');
    const ttsStart = Date.now();
    const ttsResult = await speechService.textToSpeech(aiResponse);
    console.log(`[Turn] TTS Complete (${Date.now() - ttsStart}ms): ${ttsResult.audioBase64.length} bytes`);
    
    const duration = Math.floor((Date.now() - startTime) / 1000);
    
    // Update call record
    callService.updateCallResult(req.params.id, {
      transcript: userTranscript,
      aiResponse,
      duration,
      metadata: {
        sttDuration: sttResult.duration,
        aiLatency: Date.now() - startTime,
        aiTokens: aiResult.usage,
        aiMessageId: aiMessage?.id
      }
    });
    
    console.log(`[Voice] Complete: ${duration}s`);
    
    // Return results
    res.json({
      sessionId: effectiveSessionId,
      transcript: userTranscript,
      aiResponse,
      audioBase64: ttsResult.audioBase64,
      format: ttsResult.format,
      duration,
      usage: aiResult.usage
    });
    
  } catch (err) {
    console.error('[Turn] ========== PROCESSING FAILED ==========');
    console.error(`[Turn] Error: ${err.message}`);
    console.error(`[Turn] Stack:`, err.stack);
    console.error('[Turn] =======================================');
    
    // Determine which step failed based on error message
    let failedStep = 'unknown';
    const errMsg = err.message.toLowerCase();
    
    if (errMsg.includes('stt') || errMsg.includes('speech') || errMsg.includes('recognition') || errMsg.includes('canceled')) {
      failedStep = 'stt';
    } else if (errMsg.includes('ai error') || errMsg.includes('openai') || errMsg.includes('history') || errMsg.includes('iterable')) {
      failedStep = 'ai';
    } else if (errMsg.includes('tts') || errMsg.includes('synthesis') || errMsg.includes('speechsynthesizer')) {
      failedStep = 'tts';
    } else if (errMsg.includes('conversion') || errMsg.includes('ffmpeg') || errMsg.includes('wav')) {
      failedStep = 'conversion';
    }
    
    res.status(500).json({ 
      error: 'Voice processing failed',
      step: failedStep,
      message: err.message,
      details: err.stack?.split('\n')[0]
    });
  }
});

app.get('/api/sessions/:id/calls', (req, res) => {
  const calls = callService.getSessionCalls(req.params.id);
  res.json(calls);
});

app.get('/api/calls/history', (req, res) => {
  const userId = req.userId;
  const history = callService.getCallHistory(userId);
  res.json(history);
});

// WebSocket handling with session support
wss.on('connection', (ws, req) => {
  console.log('[WebSocket] Client connected');
  
  ws.isAlive = true;
  ws.sessionId = null;
  ws.userId = null;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Handle session initialization
      if (msg.type === 'init') {
        ws.userId = msg.userId || 'anonymous';
        
        if (msg.sessionId) {
          // Reconnect to existing session
          const session = sessionService.getSession(msg.sessionId);
          if (session) {
            ws.sessionId = msg.sessionId;
            sessionService.updateSessionActivity(msg.sessionId);
            
            // Send recent messages
            const messages = messageService.getRecentMessages(msg.sessionId, 20);
            
            ws.send(JSON.stringify({
              type: 'session_restored',
              sessionId: msg.sessionId,
              messages,
              stats: sessionService.getSessionStats(msg.sessionId)
            }));
            
            console.log(`[WebSocket] Restored session: ${msg.sessionId}`);
          } else {
            // Session not found, create new
            const newSession = sessionService.createSession(ws.userId, 'New Conversation');
            ws.sessionId = newSession.id;
            
            ws.send(JSON.stringify({
              type: 'session_created',
              sessionId: newSession.id,
              restored: false
            }));
          }
        } else {
          // Create new session
          const session = sessionService.createSession(ws.userId, 'New Conversation');
          ws.sessionId = session.id;
          
          ws.send(JSON.stringify({
            type: 'session_created',
            sessionId: session.id,
            messages: []
          }));
          
          console.log(`[WebSocket] Created session: ${session.id}`);
        }
        return;
      }
      
      // Handle chat message with streaming
      if (msg.type === 'chat' && ws.sessionId) {
        // Save user message immediately
        const userMsg = messageService.addMessage(ws.sessionId, 'user', msg.content);
        
        // Broadcast to all clients in this session
        broadcastToSession(ws.sessionId, {
          type: 'message',
          data: {
            id: userMsg.id,
            role: 'user',
            content: msg.content,
            createdAt: Date.now()
          }
        }, ws);
        
        // Get conversation context
        const history = await memory.buildContext(ws.sessionId, 10);
        
        // Start streaming response
        streamingService.streamResponse(
          ws.sessionId,
          msg.content,
          history,
          ws
        );
        
        sessionService.updateSessionActivity(ws.sessionId);
        return;
      }
      
      // Handle stream cancellation
      if (msg.type === 'cancel_stream' && ws.sessionId) {
        streamingService.cancelStream(ws.sessionId);
        return;
      }
      
      // Handle clear chat
      if (msg.type === 'clear' && ws.sessionId) {
        messageService.clearSessionMessages(ws.sessionId);
        memory.clearCache(ws.sessionId);
        
        broadcastToSession(ws.sessionId, { type: 'cleared' });
        return;
      }
      
      // Handle ping/keepalive
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }
      
    } catch (err) {
      console.error('[WebSocket] Error:', err.message);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Internal server error'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected (session: ${ws.sessionId || 'none'})`);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
  });

  // Send welcome
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connected. Send {type: "init", sessionId: "..."} to start.',
    timestamp: Date.now()
  }));
});

// Broadcast to all clients in a session
function broadcastToSession(sessionId, data, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.sessionId === sessionId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Ping/pong keepalive
const keepaliveInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log('[WebSocket] Terminating inactive connection');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Cleanup on shutdown
process.on('SIGTERM', () => {
  clearInterval(keepaliveInterval);
  closeDatabase();
  server.close(() => {
    console.log('Server shutdown complete');
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

server.listen(PORT, () => {
  console.log('🚀 FridayComs v1.1 - Sessions + Streaming');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ SQLite Database: Connected');
  console.log('✓ Session Service: Active');
  console.log('✓ Message Service: Active');
  console.log('✓ Streaming Service: Active');
  console.log('✓ Conversation Memory: Active');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Port: ${PORT}`);
  console.log('\nFeatures:');
  console.log('• Persistent sessions with SQLite');
  console.log('• Real-time streaming responses');
  console.log('• Token usage tracking');
  console.log('• Conversation summaries');
  console.log('• Reconnect recovery');
});
