const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';
const PORT = process.env.PORT || 3456;

// Store chat history
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: activeConnections.size,
    messages: chatHistory.length
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

// File upload endpoint
app.post('/api/upload', (req, res) => {
  res.json({ success: true, message: 'File upload ready' });
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  activeConnections.add(ws);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    content: 'Connected to FridayComs',
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
        
        // Broadcast to all connections
        broadcast({ type: 'message', data: userMsg });
        
        // Get AI response
        try {
          const aiResponse = await getAIResponse(data.content);
          const aiMsg = {
            id: Date.now() + 1,
            type: 'ai',
            content: aiResponse,
            timestamp: Date.now()
          };
          chatHistory.push(aiMsg);
          broadcast({ type: 'message', data: aiMsg });
        } catch (err) {
          console.error('AI Error:', err);
          const errorMsg = {
            id: Date.now() + 1,
            type: 'error',
            content: 'Friday is thinking... try again in a moment.',
            timestamp: Date.now()
          };
          broadcast({ type: 'message', data: errorMsg });
        }
      }
      
      if (data.type === 'voice') {
        // Handle voice message
        const voiceMsg = {
          id: Date.now(),
          type: 'user',
          content: '🎤 Voice message',
          isVoice: true,
          timestamp: Date.now()
        };
        chatHistory.push(voiceMsg);
        broadcast({ type: 'message', data: voiceMsg });
        
        // AI response to voice
        setTimeout(() => {
          const aiMsg = {
            id: Date.now() + 1,
            type: 'ai',
            content: "I heard you! (Voice processing coming soon 🎙️)",
            timestamp: Date.now()
          };
          chatHistory.push(aiMsg);
          broadcast({ type: 'message', data: aiMsg });
        }, 1000);
      }
      
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  });
  
  ws.on('close', () => {
    activeConnections.delete(ws);
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

// AI response function
async function getAIResponse(message) {
  // Simple responses for now - can integrate with OpenClaw later
  const responses = [
    "I hear you loud and clear! 🎯",
    "That's interesting... tell me more! 💭",
    "I'm processing that... 🤖",
    "Got it! Working on it... ⚡",
    "Friday at your service! How can I help? 🚀",
    "Hmm, let me think about that... 🧠",
    "Absolutely! I'm on it. 💪",
    "Fascinating input! Keep it coming! 🎉"
  ];
  
  // Simulate thinking time
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
  
  // Determine response based on message content
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
    return "Hey there! 👋 Friday is online and ready to roll!";
  }
  if (lowerMsg.includes('help')) {
    return "I can chat with you, process voice messages, and soon I'll be fully connected to all your systems! What do you need? 🔧";
  }
  if (lowerMsg.includes('friday')) {
    return "That's me! Your AI operator, at your service! 🤖✨";
  }
  if (lowerMsg.includes('zayan') || lowerMsg.includes('zay')) {
    return "Zayan! The boss himself! What's the mission today? 🎯";
  }
  
  // Random response
  return responses[Math.floor(Math.random() * responses.length)];
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 FridayComs server running on port ${PORT}`);
  console.log(`🔒 Password protected`);
  console.log(`💬 WebSocket ready`);
});
