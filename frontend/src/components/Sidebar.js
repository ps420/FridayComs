import React from 'react';
import './Sidebar.css';

function Sidebar({ activeTab, setActiveTab, healthStatus }) {
  const isHealthy = healthStatus?.status === 'ok';

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">F</span>
          <span className="logo-text">FridayComs</span>
        </div>
        <div className={`health-indicator ${isHealthy ? 'healthy' : 'unhealthy'}`}>
          <span className="health-dot"></span>
          {isHealthy ? 'Online' : 'Offline'}
        </div>
      </div>

      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <span className="nav-icon">💬</span>
          <span>Chat</span>
        </button>
        
        <button 
          className={`nav-item ${activeTab === 'contacts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          <span className="nav-icon">👥</span>
          <span>Contacts</span>
        </button>
        
        <button 
          className={`nav-item ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <span className="nav-icon">📁</span>
          <span>Files</span>
        </button>
        
        <button 
          className={`nav-item ${activeTab === 'calls' ? 'active' : ''}`}
          onClick={() => setActiveTab('calls')}
        >
          <span className="nav-icon">📞</span>
          <span>Calls</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <button 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="nav-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
