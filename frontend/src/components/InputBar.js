import React from 'react';
import './InputBar.css';

function InputBar() {
  return (
    <div className="input-bar">
      <button className="upload-btn" title="Upload file">
        📎
      </button>
      
      <input 
        type="text" 
        className="message-input"
        placeholder="Type a message..."
      />
      
      <button className="voice-btn" title="Voice message">
        🎤
      </button>
      
      <button className="send-btn" title="Send">
        ➤
      </button>
    </div>
  );
}

export default InputBar;
