require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const AIProviderManager = require('./providers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize AI provider manager
const aiProvider = new AIProviderManager();

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';
const PORT = process.env.PORT || 3456;

// Service status tracking - will be updated dynamically
let serviceStatus = {
  backend: 'connected',
  websocket: 'connected',
  ai: 'unknown',
  voice: 'placeholder',
  openclaw: 'disconnected'
};

let chatHistory = [];
let activeConnections = new Set();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/build')));

// Auth middleware
const checkAuth = (req, res, next) => {
  if (req.path === '/api/health' || req.path === '/api/provider/status') return next();
  
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
  
  next();
};

app.use(checkAuth);

// Update AI status based on provider
function updateAIStatus() {
  const providerStatus = aiProvider.getStatus();
  const currentProvider = providerStatus.currentProvider;
  
  if (currentProvider === 'azure-openai') {
    const azureStatus = providerStatus.azure.status;
    if (azureStatus === 'connected' || azureStatus === 'ready') {
      serviceStatus.ai = 'connected';
    } else {
      serviceStatus.ai = 'error';
    }
  } else {
    serviceStatus.ai = 'mock';
  }
}

// Health check - shows real vs mock status
app.get('/api/health', (req, res) => {
  updateAIStatus();
  const aiProviderStatus = aiProvider.getStatus();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fridaycoms',
    version: '1.0.0',
    connections: activeConnections.size,
    messages: chatHistory.length,
    aiProvider: aiProviderStatus.currentProvider,
    features: {
      backend: {
        status: serviceStatus.backend,
        label: 'Backend API',
        note: '✓ Real - Express server running'
      },
      websocket: {
        status: serviceStatus.websocket,
        label: 'Real-time Chat',
        note: '✓ Real - WebSocket connected'
      },
      ai: {
        status: serviceStatus.ai,
        label: 'Friday AI',
        note: serviceStatus.ai === 'connected' 
          ? '✓ Azure OpenAI - Live responses'
          : '⚠ MOCK - Simulated responses (fallback)'
      },
      voice: {
        status: serviceStatus.voice,
        label: 'Voice Input',
        note: '📦 PLACEHOLDER - UI only, no recording'
      },
      openclaw: {
        status: serviceStatus.openclaw,
        label: 'OpenClaw Integration',
        note: '❌ NOT CONNECTED - Via backend only'
      }
    },
    provider: {
      mode: aiProviderStatus.mode,
      current: aiProviderStatus.currentProvider,
      azureConfigured: aiProviderStatus.azure.configured,
      azureStatus: aiProviderStatus.azure.status
    }
  });
});

// Provider status endpoint
app.get('/api/provider/status', (req, res) => {
  res.json(aiProvider.getStatus());
});

// Get chat history
app.get('/api/chat/history', (req, res) => {
  res.json(chatHistory);
});

// Clear chat
app.post('/api/chat/clear', (req, res) => {
  chatHistory = [];
  broadcast({ type: 'clear' });
  res.json({ success: true });
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('WebSocket connected - Real-time chat active');
  activeConnections.add(ws);
  serviceStatus.websocket = 'connected';
  
  // Determine welcome message based on AI status
  updateAIStatus();
  const isAzure = serviceStatus.ai === 'connected';
  
  ws.send(JSON.stringify({
    type: 'system',
    content: 'Connected to FridayComs',
    mockWarning: isAzure ? null : '⚠️ AI running in MOCK MODE (fallback)',
    provider: aiProvider.getStatus().currentProvider,
    timestamp: Date.now()
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'chat') {
        // Store user message
        const userMsg = {
          id: Date.now(),
          type: 'user',
          content: data.content,
          timestamp: Date.now()
        };
        chatHistory.push(userMsg);
        broadcast({ type: 'message', data: userMsg });
        
        // Get AI response through provider manager
        try {
          const aiResponse = await aiProvider.sendMessage(data.content, chatHistory);
          
          const aiMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: aiResponse.provider === 'mock',
            provider: aiResponse.provider,
            latency: aiResponse.latency,
            content: aiResponse.content,
            timestamp: Date.now()
          };
          
          chatHistory.push(aiMsg);
          broadcast({ type: 'message', data: aiMsg });
          
        } catch (error) {
          console.error('AI Provider error:', error.message);
          
          // Fallback to mock on Azure error
          const errorMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: true,
            isError: true,
            content: `[⚠️ Azure Error - Fallback to Mock] ${error.message}. Using mock response for now.`,
            timestamp: Date.now()
          };
          
          chatHistory.push(errorMsg);
          broadcast({ type: 'message', data: errorMsg });
        }
      }
      
      if (data.type === 'voice') {
        const voiceMsg = {
          id: Date.now(),
          type: 'user',
          content: '🎤 Voice message sent',
          isVoice: true,
          note: 'Voice recording is PLACEHOLDER - no audio captured',
          timestamp: Date.now()
        };
        chatHistory.push(voiceMsg);
        broadcast({ type: 'message', data: voiceMsg });
        
        try {
          const aiResponse = await aiProvider.sendMessage('User sent a voice message (placeholder)', chatHistory);
          
          const aiMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: aiResponse.provider === 'mock',
            provider: aiResponse.provider,
            content: `[${aiResponse.provider === 'mock' ? '🤖 MOCK' : '🤖 Friday'}] I received your voice placeholder! Real voice processing not yet connected.`,
            timestamp: Date.now()
          };
          
          chatHistory.push(aiMsg);
          broadcast({ type: 'message', data: aiMsg });
        } catch (error) {
          const fallbackMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: true,
            content: '[🤖 MOCK AI] Voice placeholder acknowledged. Real voice processing not connected.',
            timestamp: Date.now()
          };
          chatHistory.push(fallbackMsg);
          broadcast({ type: 'message', data: fallbackMsg });
        }
      }
      
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  });
  
  ws.on('close', () => {
    activeConnections.delete(ws);
    if (activeConnections.size === 0) {
      serviceStatus.websocket = 'waiting';
    }
    console.log('WebSocket disconnected');
  });
});

// Broadcast to all connections
function broadcast(data) {
  const msg = JSON.stringify(data);
  activeConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

server.listen(PORT, () => {
  updateAIStatus();
  const providerStatus = aiProvider.getStatus();
  
  console.log('🚀 FridayComs with Azure OpenAI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Backend: Real (Express)');
  console.log('✓ WebSocket: Real (ws)');
  console.log(`● AI Provider: ${providerStatus.currentProvider}`);
  if (providerStatus.currentProvider === 'azure-openai') {
    console.log(`  - Endpoint: ${providerStatus.azure.endpoint || 'Configured'}`);
    console.log(`  - Status: ${providerStatus.azure.status}`);
  } else {
    console.log('  - Azure OpenAI: Not configured (using mock fallback)');
  }
  console.log('📦 Voice: Placeholder (UI only)');
  console.log('❌ OpenClaw: Backend integrated, frontend via API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Port: ${PORT}`);
  console.log(`\nRequired env vars for Azure:`);
  console.log('  AZURE_OPENAI_ENDPOINT');
  console.log('  AZURE_OPENAI_API_KEY');
  console.log('  AZURE_OPENAI_DEPLOYMENT');
});
