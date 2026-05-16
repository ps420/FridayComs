import React from 'react';
import './ChatArea.css';

function ChatArea() {
  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-info">
          <h2>D.O.T.</h2>
          <span className="status">Active</span>
        </div>
      </div>
      
      <div className="messages-container">
        <div className="welcome-message">
          <h1>Welcome to FridayComs</h1>
          <p>Desktop interface placeholder - ready for integration</p>
        </div>
      </div>
    </div>
  );
}

export default ChatArea;
