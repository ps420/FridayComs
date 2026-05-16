import React from 'react';
import './ChatArea.css';

function ChatArea({ messages, isTyping, aiProvider }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isAzureMode = aiProvider === 'azure-openai';

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-info">
          <h2>Zayan</h2>
          <span className="status">Active</span>
        </div>
        <div className={`provider-badge ${isAzureMode ? 'azure' : 'mock'}`} title={isAzureMode ? 'Azure OpenAI connected' : 'AI in mock mode'}>
          {isAzureMode ? '✓ Azure OpenAI' : '⚠️ MOCK MODE'}
        </div>
      </div>
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h1>Welcome to FridayComs</h1>
            <p>Your AI companion interface.</p>
            <div className="status-box">
              <h3>System Status:</h3>
              <ul>
                <li className="status-real">✓ Backend: Real & Connected</li>
                <li className="status-real">✓ WebSocket: Real-time Chat Active</li>
                <li className={isAzureMode ? 'status-real' : 'status-mock'}>
                  {isAzureMode ? '✓ AI: Azure OpenAI (Live)' : '⚠ AI: MOCK (Fallback)'}
                </li>
                <li className="status-placeholder">📦 Voice: Placeholder (UI only)</li>
                <li className="status-off">❌ OpenClaw: Backend only</li>
              </ul>
            </div>
            <p style={{ marginTop: '20px', fontSize: '12px', opacity: 0.5 }}>
              {isAzureMode 
                ? 'Azure OpenAI is active! Type a message to chat with Friday.'
                : 'Azure OpenAI not configured. Check Settings → Azure Status.'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`message ${msg.type} ${msg.isMock ? 'mock' : ''}`}
              >
                {msg.isVoice && <span style={{ marginRight: '8px' }}>🎤</span>}
                {msg.content}
                {msg.note && (
                  <div className="message-note">{msg.note}</div>
                )}
                {msg.latency && (
                  <div className="message-meta">
                    <span className="provider-tag">
                      {msg.provider === 'azure-openai' ? 'Azure' : 'Mock'} • {msg.latency}ms
                    </span>
                  </div>
                )}
                <div className="message-timestamp">
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ChatArea;
