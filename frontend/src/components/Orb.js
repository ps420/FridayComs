import React, { useState } from 'react';
import './Orb.css';

function Orb({ onClick }) {
  const [isActive, setIsActive] = useState(false);

  const handleClick = () => {
    setIsActive(true);
    onClick?.();
    setTimeout(() => setIsActive(false), 1000);
  };

  return (
    <div className="orb-container">
      <div 
        className={`orb ${isActive ? 'active' : ''}`}
        onClick={handleClick}
      >
        <div className="orb-inner">
          <svg className="orb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div className="orb-glow"></div>
        <div className="orb-rings">
          <div className="orb-ring"></div>
          <div className="orb-ring"></div>
          <div className="orb-ring"></div>
        </div>
      </div>
      <span className="orb-label">Tap to speak</span>
      <span className="orb-hint">Press & hold</span>
    </div>
  );
}

export default Orb;
