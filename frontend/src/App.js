import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Orb from './components/Orb';
import InputBar from './components/InputBar';
import SettingsPanel from './components/SettingsPanel';

function App() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      console.log('Connected to FridayComs');
      setIsConnected(true);
    };
    
    ws.current.onclose = () => {
      console.log('Disconnected from FridayComs');
      setIsConnected(false);
    };
    
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'message') {
        setMessages(prev => [...prev, data.data]);
        if (data.data.type === 'ai') {
          setIsTyping(false);
        }
      }
      
      if (data.type === 'clear') {
        setMessages([]);
      }
    };
    
    // Health check
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data))
      .catch(err => setHealthStatus({ status: 'error' }));
    
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const sendMessage = (content) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'chat',
        content
      }));
      setIsTyping(true);
    }
  };

  const sendVoice = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'voice'
      }));
      setIsTyping(true);
    }
  };

  const clearChat = () => {
    fetch('/api/chat/clear', { method: 'POST' });
    setMessages([]);
  };

  return (
    <div className="app">
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '● Connected' : '○ Disconnected'}
      </div>
      
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        healthStatus={healthStatus}
        messageCount={messages.length}
        onClearChat={clearChat}
      />
      
      <div className="main-content">
        {activeTab === 'chat' && (
          <>
            <ChatArea 
              messages={messages} 
              isTyping={isTyping}
            />
            <Orb onClick={sendVoice} />
            <InputBar onSend={sendMessage} />
          </>
        )}
        
        {activeTab === 'settings' && <SettingsPanel />}
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
