import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Orb from './components/Orb';
import InputBar from './components/InputBar';
import SettingsPanel from './components/SettingsPanel';

function App() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    // Check backend health
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(data))
      .catch(err => setHealthStatus({ status: 'error', error: err.message }));
  }, []);

  return (
    <div className="app">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        healthStatus={healthStatus}
      />
      
      <div className="main-content">
        {activeTab === 'chat' && (
          <>
            <ChatArea />
            <Orb />
            <InputBar />
          </>
        )}
        
        {activeTab === 'settings' && <SettingsPanel />}
      </div>

      <button 
        className="settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        ⚙️
      </button>
    </div>
  );
}

export default App;
