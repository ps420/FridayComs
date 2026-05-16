import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Orb from './components/Orb';
import InputBar from './components/InputBar';
import SettingsPanel from './components/SettingsPanel';
import Calls from './components/Calls';

function App() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [aiProvider, setAiProvider] = useState('unknown');
  
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Generate or retrieve session ID
  useEffect(() => {
    const storedSessionId = localStorage.getItem('fridaycoms_session_id');
    if (storedSessionId) {
      setSessionId(storedSessionId);
    }
  }, []);

  // Connect WebSocket with reconnect logic
  const connectWebSocket = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('[WebSocket] Connecting...');
    setIsReconnecting(reconnectAttempts.current > 0);
    
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttempts.current = 0;
      
      // Initialize or restore session
      const storedSessionId = localStorage.getItem('fridaycoms_session_id');
      ws.current.send(JSON.stringify({
        type: 'init',
        sessionId: storedSessionId,
        userId: 'zayan'
      }));
    };
    
    ws.current.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      
      // Attempt reconnect
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        reconnectTimeout.current = setTimeout(connectWebSocket, delay);
      }
    };
    
    ws.current.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
    };
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
  }, []);

  // Handle WebSocket messages
  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'session_created':
      case 'session_restored':
        if (data.sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem('fridaycoms_session_id', data.sessionId);
        }
        if (data.messages) {
          setMessages(data.messages);
        }
        break;
        
      case 'message':
        setMessages(prev => [...prev, data.data]);
        break;
        
      case 'stream_start':
        setIsTyping(true);
        setStreamingContent('');
        break;
        
      case 'stream_token':
        setStreamingContent(data.content);
        break;
        
      case 'stream_end':
        setIsTyping(false);
        setStreamingContent('');
        setMessages(prev => [...prev, {
          id: data.messageId,
          role: 'assistant',
          content: data.content,
          provider: data.usage ? 'azure-openai' : 'mock',
          latency: data.latency,
          usage: data.usage,
          createdAt: Date.now()
        }]);
        break;
        
      case 'stream_error':
        setIsTyping(false);
        setStreamingContent('');
        break;
        
      case 'cleared':
        setMessages([]);
        break;
        
      case 'connected':
        console.log('[WebSocket]', data.message);
        break;
        
      default:
        console.log('[WebSocket] Unknown message:', data);
    }
  };

  // Initial connection
  useEffect(() => {
    connectWebSocket();
    
    // Health check
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealthStatus(data);
        const isAzure = data.features?.ai?.status === 'connected';
        setAiProvider(isAzure ? 'azure-openai' : 'mock');
      })
      .catch(console.error);
    
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connectWebSocket]);

  // Send message
  const sendMessage = (content) => {
    if (ws.current?.readyState === WebSocket.OPEN && sessionId) {
      ws.current.send(JSON.stringify({
        type: 'chat',
        content,
        sessionId
      }));
    }
  };

  // Send voice placeholder
  const sendVoice = () => {
    if (ws.current?.readyState === WebSocket.OPEN && sessionId) {
      ws.current.send(JSON.stringify({
        type: 'voice',
        sessionId
      }));
    }
  };

  // Clear chat
  const clearChat = () => {
    if (ws.current?.readyState === WebSocket.OPEN && sessionId) {
      ws.current.send(JSON.stringify({
        type: 'clear',
        sessionId
      }));
    }
  };

  // Create new session
  const createNewSession = () => {
    localStorage.removeItem('fridaycoms_session_id');
    setSessionId(null);
    setMessages([]);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'init',
        userId: 'zayan'
      }));
    }
  };

  return (
    <div className="app">
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'} ${isReconnecting ? 'reconnecting' : ''}`}>
        {isReconnecting ? '↻ Reconnecting...' : isConnected ? '● Live' : '○ Offline'}
      </div>
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        healthStatus={healthStatus}
        messageCount={messages.length}
        onClearChat={clearChat}
        onNewSession={createNewSession}
        sessionId={sessionId}
      />
      
      <div className="main-content">
        {activeTab === 'chat' && (
          <>
            <ChatArea 
              messages={messages} 
              isTyping={isTyping}
              streamingContent={streamingContent}
              aiProvider={aiProvider}
              sessionId={sessionId}
            />
            <Orb onClick={sendVoice} />
            <InputBar onSend={sendMessage} disabled={!isConnected || !sessionId} />
          </>
        )}
        
        {activeTab === 'calls' && <Calls sessionId={sessionId} />}
        {activeTab === 'settings' && <SettingsPanel sessionId={sessionId} />}
      </div>

      <button 
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        ⚙️
      </button>
    </div>
  );
}

export default App;
