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
      </div>
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h1>Welcome to FridayComs</h1>
            <p>Your AI companion is ready. Start chatting or tap the orb to speak.</p>
            <p style={{ marginTop: '20px', fontSize: '12px', opacity: 0.5 }}>
              Type a message below to begin...
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`message ${msg.type}`}
              >
                {msg.isVoice && <span style={{ marginRight: '8px' }}>🎤</span>}
                {msg.content}
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
