const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';
const PORT = process.env.PORT || 3456;

// Service status tracking
const serviceStatus = {
  backend: 'connected',
  websocket: 'connected',
  ai: 'mock',
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
  if (req.path === '/api/health') return next();
  
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

// Health check - shows real vs mock status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fridaycoms',
    version: '1.0.0',
    connections: activeConnections.size,
    messages: chatHistory.length,
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
        note: '⚠ MOCK - Simulated responses only'
      },
      voice: {
        status: serviceStatus.voice,
        label: 'Voice Input',
        note: '📦 PLACEHOLDER - UI only, no recording'
      },
      openclaw: {
        status: serviceStatus.openclaw,
        label: 'OpenClaw Integration',
        note: '❌ NOT CONNECTED - Next implementation'
      }
    }
  });
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
  
  // Send welcome with clear mock disclaimer
  ws.send(JSON.stringify({
    type: 'system',
    content: 'Connected to FridayComs',
    mockWarning: '⚠️ AI responses are MOCK/SIMULATED for UI testing only.',
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
        
        // MOCK AI response - clearly labeled
        setTimeout(() => {
          const mockMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: true,
            content: `[🤖 MOCK AI] ${getMockResponse(data.content)}`,
            note: 'This is a simulated response for UI testing. Real Friday AI not connected yet.',
            timestamp: Date.now()
          };
          chatHistory.push(mockMsg);
          broadcast({ type: 'message', data: mockMsg });
        }, 500 + Math.random() * 1000);
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
        
        setTimeout(() => {
          const mockMsg = {
            id: Date.now() + 1,
            type: 'ai',
            isMock: true,
            content: '[🤖 MOCK AI] Voice placeholder acknowledged. Real voice processing not connected.',
            timestamp: Date.now()
          };
          chatHistory.push(mockMsg);
          broadcast({ type: 'message', data: mockMsg });
        }, 1000);
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

// MOCK responses - clearly for UI testing only
function getMockResponse(message) {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
    return "[MOCK] Hey! This is a simulated greeting. Real Friday AI coming soon.";
  }
  if (lowerMsg.includes('help')) {
    return "[MOCK] Help command simulated. Features: Backend ✓ | WebSocket ✓ | AI (this is mock) | Voice (placeholder) | OpenClaw ❌";
  }
  if (lowerMsg.includes('status')) {
    return "[MOCK] System status - Backend: connected | AI: MOCK MODE | OpenClaw: not connected";
  }
  if (lowerMsg.includes('friday')) {
    return "[MOCK] You called? I'm Friday in placeholder mode. Real intelligence via OpenClaw coming next.";
  }
  if (lowerMsg.includes('mock') || lowerMsg.includes('fake')) {
    return "[MOCK] Yes, I'm currently a mock! Backend and WebSocket are real. AI is simulated for UI testing.";
  }
  
  const responses = [
    "[MOCK] This is a simulated response for UI testing.",
    "[MOCK] Real Friday AI not connected yet - backend is live though!",
    "[MOCK] UI test message - OpenClaw integration coming next.",
    "[MOCK] Chat system working! Ready for real AI connection.",
    "[MOCK] FridayComs backend ✓ | WebSocket ✓ | AI (mock only)"
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

server.listen(PORT, () => {
  console.log('🚀 FridayComs Enhanced');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Backend: Real (Express)');
  console.log('✓ WebSocket: Real (ws)');
  console.log('⚠ AI: MOCK/Simulated (UI testing)');
  console.log('📦 Voice: Placeholder (UI only)');
  console.log('❌ OpenClaw: Not connected (next step)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Port: ${PORT}`);
});
