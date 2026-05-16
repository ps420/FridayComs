import React from 'react';
import './ChatArea.css';

function ChatArea({ messages, isTyping }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-info">
          <h2>Zayan</h2>
          <span className="status">Active</span>
        </div>
        <div className="mock-badge" title="AI is in MOCK mode for UI testing">
          ⚠️ MOCK AI
        </div>
      </div>
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h1>Welcome to FridayComs</h1>
            <p>Your AI companion interface is ready for testing.</p>
            <div className="status-box">
              <h3>Current Status:</h3>
              <ul>
                <li className="status-real">✓ Backend: Real & Connected</li>
                <li className="status-real">✓ WebSocket: Real-time Chat Active</li>
                <li className="status-mock">⚠ AI: MOCK/Simulated (UI testing)</li>
                <li className="status-placeholder">📦 Voice: Placeholder (UI only)</li>
                <li className="status-off">❌ OpenClaw: Not connected (next)</li>
              </ul>
            </div>
            <p style={{ marginTop: '20px', fontSize: '12px', opacity: 0.5 }}>
              Type a message below to test the chat interface
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
