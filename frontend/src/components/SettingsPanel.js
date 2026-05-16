import React, { useState, useEffect } from 'react';
import './SettingsPanel.css';

function SettingsPanel() {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [stats, setStats] = useState({ connections: 0, messages: 0, uptime: 'Active' });
  const [features, setFeatures] = useState({});
  const [provider, setProvider] = useState({ mode: 'unknown', current: 'unknown', azureConfigured: false });
  const [azureDetails, setAzureDetails] = useState({ status: 'unknown', endpoint: null });

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setStats({ 
          connections: data.connections || 0,
          messages: data.messages || 0, 
          uptime: 'Active' 
        });
        setFeatures(data.features || {});
        setProvider(data.provider || { mode: 'unknown', current: 'unknown' });
        if (data.provider?.azureConfigured) {
          setAzureDetails({
            status: data.provider.azureStatus || 'unknown',
            endpoint: data.provider.azureEndpoint || null
          });
        }
      })
      .catch(() => {
        setStats({ connections: 0, messages: 0, uptime: 'Offline' });
        setFeatures({});
      });
  }, []);

  return (
    <div className="settings-panel">
      <h2>Settings</h2>
      
      <div className="settings-section">
        <h3>System Status</h3>
        <div className="feature-status-list">
          {Object.entries(features).map(([key, feature]) => (
            <div key={key} className={`feature-status ${feature.status}`}>
              <div className="feature-header">
                <span className="feature-name">{feature.label}</span>
                <span className={`feature-badge ${feature.status}`}>
                  {feature.status === 'connected' && '✓'}
                  {feature.status === 'mock' && 'MOCK'}
                  {feature.status === 'placeholder' && 'PLACEHOLDER'}
                  {feature.status === 'disconnected' && 'OFF'}
                </span>
              </div>
              <span className="feature-note">{feature.note}</span>
            </div>
          ))}
        </div>
      </div>

      {provider.azureConfigured && (
        <div className="settings-section">
          <h3>Azure OpenAI</h3>
          <div className="azure-config">
            <div className="config-item">
              <span className="config-label">Mode:</span>
              <span className="config-value">{provider.mode}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Current Provider:</span>
              <span className={`config-value ${provider.current === 'azure-openai' ? 'azure-active' : ''}`}>
                {provider.current === 'azure-openai' ? '✓ Azure OpenAI' : provider.current}
              </span>
            </div>
            <div className="config-item">
              <span className="config-label">Azure Status:</span>
              <span className={`config-value ${azureDetails.status === 'connected' || azureDetails.status === 'ready' ? 'azure-active' : ''}`}>
                {azureDetails.status}
              </span>
            </div>
            {azureDetails.endpoint && (
              <div className="config-item">
                <span className="config-label">Endpoint:</span>
                <span className="config-value endpoint">{azureDetails.endpoint}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="settings-section">
        <h3>Appearance</h3>
        <div className="setting-item">
          <div className="setting-info">
            <label>Dark Mode</label>
            <span className="setting-desc">Use dark theme throughout the app</span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={darkMode}
              onChange={(e) => setDarkMode(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div className="setting-item">
          <div className="setting-info">
            <label>Animations</label>
            <span className="setting-desc">Enable smooth transitions and effects</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" defaultChecked />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Notifications</h3>
        <div className="setting-item">
          <div className="setting-info">
            <label>Push Notifications</label>
            <span className="setting-desc">Get notified of new messages</span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div className="setting-item">
          <div className="setting-info">
            <label>Sound Effects</label>
            <span className="setting-desc">Play sounds for notifications</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div className="settings-section">
        <h3>Voice</h3>
        <div className="setting-item">
          <div className="setting-info">
            <label>Voice Input</label>
            <span className="setting-desc">Enable microphone for voice messages</span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        
        <div className="setting-item">
          <div className="setting-info">
            <label>Auto-Play Voice</label>
            <span className="setting-desc">Automatically play received voice messages</span>
          </div>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div className="settings-section stats-section">
        <h3>Statistics</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.messages}</span>
            <span className="stat-label">Messages</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.connections}</span>
            <span className="stat-label">Connections</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">v1.0</span>
            <span className="stat-label">Version</span>
          </div>
        </div>
      </div>
      
      <div className="settings-section about-section">
        <h3>About</h3>
        <div className="about-content">
          <div className="about-logo">
            <span>F</span>
          </div>
          <div className="about-info">
            <h4>FridayComs</h4>
            <p>AI Companion Interface</p>
            <p className="about-version">Version 1.0.0 • Friday + Azure OpenAI</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
