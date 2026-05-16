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

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize services
const sessionService = new SessionService();
const messageService = new MessageService();
const streamingService = new StreamingService();
const memory = new ConversationMemory();

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json());
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
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fridaycoms',
    version: '1.1.0',
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
      voice: { status: 'placeholder', note: 'UI only' }
    }
  });
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
