import React from 'react';
import './Orb.css';

function Orb() {
  return (
    <div className="orb-container">
      <div className="orb">
        <div className="orb-inner"></div>
        <div className="orb-glow"></div>
      </div>
      <div className="orb-label">Tap to speak</div>
    </div>
  );
}

export default Orb;
