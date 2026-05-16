import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Calls.css';

function Calls({ sessionId }) {
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, active, ended
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [callHistory, setCallHistory] = useState([]);
  const [activeCallId, setActiveCallId] = useState(null);
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const callTimer = useRef(null);
  const analyser = useRef(null);
  const audioContext = useRef(null);
  const animationFrame = useRef(null);

  // Load call history
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}/calls`)
        .then(res => res.json())
        .then(data => setCallHistory(data))
        .catch(console.error);
    }
  }, [sessionId]);

  // Start a call
  const startCall = useCallback(async () => {
    if (!sessionId) {
      alert('Please start a chat session first');
      return;
    }

    try {
      // Initialize audio context
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        // In full implementation, send to backend for processing
        console.log('Recording stopped, blob size:', audioBlob.size);
      };
      
      // Start recording
      mediaRecorder.current.start(1000); // Collect data every second
      
      // Set up audio visualization
      const source = audioContext.current.createMediaStreamSource(stream);
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      source.connect(analyser.current);
      
      visualizeAudio();
      
      // Update UI
      setCallStatus('active');
      setCallDuration(0);
      
      // Start duration timer
      callTimer.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      
      // Create call on backend
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, callType: 'voice' })
      });
      
      const callData = await response.json();
      setActiveCallId(callData.id);
      
      // Simulate AI speaking after delay
      setTimeout(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          playGreeting();
        }
      }, 2000);
      
    } catch (err) {
      console.error('Failed to start call:', err);
      alert('Could not access microphone. Please check permissions.');
      endCall();
    }
  }, [sessionId]);

  // Audio visualization
  const visualizeAudio = () => {
    if (!analyser.current) return;
    
    const bufferLength = analyser.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyser.current) return;
      
      animationFrame.current = requestAnimationFrame(draw);
      analyser.current.getByteFrequencyData(dataArray);
      
      // Calculate average level
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setAudioLevel(average / 255);
    };
    
    draw();
  };

  // Play greeting (placeholder for AI voice)
  const playGreeting = () => {
    const utterance = new SpeechSynthesisUtterance('Hello Zayan, this is Friday. I can hear you loud and clear!');
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    
    setTranscript('Friday: Hello Zayan, this is Friday. I can hear you loud and clear!');
  };

  // End call
  const endCall = useCallback(async () => {
    // Stop recording
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
    
    // Stop audio context
    if (audioContext.current) {
      audioContext.current.close();
    }
    
    // Stop visualization
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    
    // Clear timer
    if (callTimer.current) {
      clearInterval(callTimer.current);
    }
    
    setAudioLevel(0);
    setCallStatus('ended');
    
    // End call on backend
    if (activeCallId) {
      await fetch(`/api/calls/${activeCallId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });
      
      // Refresh history
      const history = await fetch(`/api/sessions/${sessionId}/calls`).then(r => r.json());
      setCallHistory(history);
    }
    
    setActiveCallId(null);
    setTranscript('');
    
    // Reset after delay
    setTimeout(() => {
      setCallStatus('idle');
      setCallDuration(0);
    }, 3000);
  }, [activeCallId, sessionId, transcript]);

  // Toggle mute
  const toggleMute = () => {
    if (mediaRecorder.current && mediaRecorder.current.stream) {
      const audioTrack = mediaRecorder.current.stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!isMuted);
    }
  };

  // Toggle speaker
  const toggleSpeaker = () => {
    setIsSpeaker(!isSpeaker);
  };

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="calls-container">
      {/* Active Call Interface */}
      {(callStatus === 'active' || callStatus === 'calling') && (
        <div className="active-call-overlay">
          <div className="call-status">
            {callStatus === 'calling' ? 'Calling...' : 'On Call'}
          </div>
          
          <div className="call-avatar">
            <div className="avatar-ring" style={{ transform: `scale(${1 + audioLevel * 0.3})` }}>
              <span>F</span>
            </div>
            <div className="audio-waves">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className="wave"
                  style={{ 
                    height: `${20 + audioLevel * 60 + Math.random() * 20}px`,
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </div>
          </div>
          
          <div className="call-info">
            <div className="call-name">Friday AI</div>
            <div className="call-timer">{formatDuration(callDuration)}</div>
          </div>

          {transcript && (
            <div className="transcript-box">
              <p>{transcript}</p>
            </div>
          )}

          <div className="call-controls">
            <button 
              className={`control-btn ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            
            <button 
              className="control-btn end-call"
              onClick={endCall}
              title="End Call"
            >
              📞
            </button>
            
            <button 
              className={`control-btn ${isSpeaker ? 'active' : ''}`}
              onClick={toggleSpeaker}
              title="Speaker"
            >
              🔊
            </button>
          </div>
        </div>
      )}

      {/* Call Ended Screen */}
      {callStatus === 'ended' && (
        <div className="call-ended">
          <div className="ended-icon">📞</div>
          <h3>Call Ended</h3>
          <p>Duration: {formatDuration(callDuration)}</p>
          <button className="new-call-btn" onClick={() => setCallStatus('idle')}>
            New Call
          </button>
        </div>
      )}

      {/* Dialer / Call History */}
      {callStatus === 'idle' && (
        <>
          <div className="dialer-section">
            <div className="dialer-header">
              <h2>Voice Call</h2>
              <p>Call Friday directly with voice</p>
            </div>

            <div className="call-button-container">
              <button className="big-call-btn" onClick={startCall}>
                <span className="call-icon">📞</span>
                <span className="call-text">Call Friday</span>
              </button>
            </div>

            <div className="quick-actions">
              <button className="quick-btn">
                <span>🎤</span>
                Voice Message
              </button>
              <button className="quick-btn">
                <span>📹</span>
                Video (Soon)
              </button>
            </div>
          </div>

          <div className="call-history">
            <h3>Recent Calls</h3>
            {callHistory.length === 0 ? (
              <p className="no-calls">No calls yet. Start your first call!</p>
            ) : (
              <div className="call-list">
                {callHistory.map(call => (
                  <div key={call.id} className={`call-item ${call.status}`}>
                    <div className="call-icon">
                      {call.direction === 'outbound' ? '📤' : '📥'}
                    </div>
                    <div className="call-details">
                      <div className="call-title">
                        {call.callType === 'voice' ? 'Voice Call' : 'Video Call'}
                      </div>
                      <div className="call-meta">
                        {call.status === 'ended' 
                          ? `${formatDuration(call.duration)} • ${new Date(call.createdAt).toLocaleDateString()}`
                          : call.status
                        }
                      </div>
                    </div>
                    <div className="call-actions">
                      <button 
                        className="call-again-btn"
                        onClick={startCall}
                      >
                        📞
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Calls;
