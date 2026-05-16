import React from 'react';
import './SettingsPanel.css';

function SettingsPanel() {
  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      
      <div className="settings-section">
        <h3>General</h3>
        <div className="setting-item">
          <label>Theme</label>
          <select>
            <option>Dark</option>
            <option>Light</option>
            <option>Auto</option>
          </select>
        </div>
        
        <div className="setting-item">
          <label>Startup</label>
          <div className="toggle">
            <input type="checkbox" id="startup" />
            <label htmlFor="startup">Launch on system startup</label>
          </div>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Voice</h3>
        <div className="setting-item">
          <label>Voice Input</label>
          <div className="toggle">
            <input type="checkbox" id="voice" defaultChecked />
            <label htmlFor="voice">Enable voice messages</label>
          </div>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>About</h3>
        <div className="about-info">
          <p>FridayComs v1.0.0</p>
          <p>Desktop AI Companion Interface</p>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
