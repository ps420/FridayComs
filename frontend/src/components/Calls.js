import React, { useState } from 'react';
import VoiceNoteMode from './VoiceNoteMode';
import LiveCallMode from './LiveCallMode';
import './Calls.css';

function Calls({ sessionId }) {
  const [mode, setMode] = useState('select'); // select, voice-note, live-call

  if (mode === 'select') {
    return (
      <div className="calls-container">
        <div className="calls-intro">
          <h2>🎙️ Voice</h2>
          <p>Choose how you want to speak with Friday</p>
        </div>

        <div className="mode-selection">
          <button 
            className="mode-card microphone-mode"
            onClick={() => setMode('voice-note')}
          >
            <div className="mode-icon">🎤</div>
            <h3>Microphone Mode</h3>
            <p>Press, speak, release. Friday responds after you finish.</p>
            <span className="badge">Like WhatsApp voice notes</span>
          </button>

          <button 
            className="mode-card live-mode"
            onClick={() => setMode('live-call')}
          >
            <div className="mode-icon">📞</div>
            <h3>Live Call Mode</h3>
            <p>Continuous conversation. Friday listens, detects silence, then replies.</p>
            <span className="badge">Experimental</span>
          </button>
        </div>

        <div className="mode-help">
          <p><strong>Not working?</strong> Make sure your Azure Speech key is configured on the backend.</p>
        </div>
      </div>
    );
  }

  if (mode === 'voice-note') {
    return (
      <div className="calls-container">
        <button className="back-btn" onClick={() => setMode('select')}>
          ← Back
        </button>
        <VoiceNoteMode sessionId={sessionId} />
      </div>
    );
  }

  if (mode === 'live-call') {
    return (
      <div className="calls-container">
        <button className="back-btn" onClick={() => setMode('select')}>
          ← Back
        </button>
        <LiveCallMode sessionId={sessionId} />
      </div>
    );
  }

  return null;
}

export default Calls;
