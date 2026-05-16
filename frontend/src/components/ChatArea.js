import React from 'react';
import './ChatArea.css';

function ChatArea({ messages, isTyping, streamingContent, aiProvider, sessionId }) {
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isAzureMode = aiProvider === 'azure-openai';

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-info">
          <h2>Friday</h2>
          {sessionId && (
            <span className="session-id" title={sessionId}>
              Session: {sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="header-badges">
          <div className={`provider-badge ${isAzureMode ? 'azure' : 'mock'}`}>
            {isAzureMode ? '⚡ Streaming' : '⚠️ Mock'}
          </div>
          {streamingContent && (
            <div className="streaming-indicator">
              <span className="pulse"></span>
              Typing...
            </div>
          )}
        </div>
      </div>
      
      <div className="messages-container">
        {messages.length === 0 && !streamingContent ? (
          <div className="welcome-message">
            <h1>Welcome to FridayComs</h1>
            <p className="subtitle">Persistent AI conversations with streaming</p>
            
            <div className="features-grid">
              <div className="feature-item">
                <span className="feature-icon">💾</span>
                <span>Sessions persist after refresh</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <span>Real-time streaming responses</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">📊</span>
                <span>Token usage tracking</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">🔄</span>
                <span>Auto-reconnect on disconnect</span>
              </div>
            </div>

            <div className={`status-badge ${isAzureMode ? 'azure' : 'mock'}`}>
              {isAzureMode 
                ? '✓ Azure OpenAI Connected with Streaming'
                : '⚠ Running in Mock Mode'}
            </div>

            <p className="hint">
              Type a message to start a persistent conversation
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div 
                key={msg.id || index} 
                className={`message ${msg.role} ${msg.provider === 'mock' ? 'mock' : ''}`}
              >
                <div className="message-header">
                  <span className="message-role">
                    {msg.role === 'user' ? 'You' : 'Friday'}
                  </span>
                  {msg.latency && (
                    <span className="message-meta">
                      {msg.provider === 'azure-openai' && <span className="azure-dot">●</span>}
                      {msg.latency}ms • {msg.usage?.total_tokens || 0} tokens
                    </span>
                  )}
                </div>
                
                <div className="message-content">
                  {msg.content}
                </div>
                
                <div className="message-footer">
                  <span className="message-time">
                    {formatTime(msg.createdAt)}
                  </span>
                  {msg.provider === 'mock' && (
                    <span className="mock-label">MOCK</span>
                  )}
                </div>
              </div>
            ))}
            
            {/* Streaming message */}
            {streamingContent && (
              <div className="message assistant streaming">
                <div className="message-header">
                  <span className="message-role">Friday</span>
                  <span className="streaming-indicator-inline">
                    <span className="pulse"></span>
                    Streaming...
                  </span>
                </div>
                <div className="message-content">
                  {streamingContent}
                  <span className="cursor">|</span>
                </div>
              </div>
            )}
            
            {/* Typing indicator for non-streaming */}
            {isTyping && !streamingContent && (
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
