import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Calls.css';

function Calls({ sessionId }) {
  const [callStatus, setCallStatus] = useState('idle'); // idle, recording, processing, playing, ended
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [callHistory, setCallHistory] = useState([]);
  const [activeCallId, setActiveCallId] = useState(null);
  const [error, setError] = useState(null);
  const [processingStep, setProcessingStep] = useState('');
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const callTimer = useRef(null);
  const analyser = useRef(null);
  const audioContext = useRef(null);
  const animationFrame = useRef(null);
  const audioPlayer = useRef(new Audio());

  // Load call history
  useEffect(() => {
    if (sessionId) {
      loadCallHistory();
    }
  }, [sessionId]);

  const loadCallHistory = async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/calls`);
      const data = await res.json();
      setCallHistory(data);
    } catch (err) {
      console.error('Failed to load call history:', err);
    }
  };

  // Start recording
  const startRecording = useCallback(async () => {
    if (!sessionId) {
      setError('Please start a chat session first');
      return;
    }

    setError(null);

    try {
      // Create call on backend first
      const callRes = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, callType: 'voice' })
      });
      
      const callData = await callRes.json();
      setActiveCallId(callData.id);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder - use webm/opus for best compatibility
      mediaRecorder.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        await processVoiceCall(audioBlob, callData.id);
      };
      
      // Set up audio visualization
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.current.createMediaStreamSource(stream);
      analyser.current = audioContext.current.createAnalyser();
      analyser.current.fftSize = 256;
      source.connect(analyser.current);
      
      visualizeAudio();
      
      // Start recording
      mediaRecorder.current.start();
      setCallStatus('recording');
      setUserTranscript('');
      setAiResponse('');
      
      // Start duration timer
      const startTime = Date.now();
      callTimer.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError(err.message || 'Could not access microphone');
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

  // Stop recording and process
  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      
      // Stop all tracks
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
    setCallStatus('processing');
  }, []);

  // Process voice call: send to backend for STT -> AI -> TTS
  const processVoiceCall = async (audioBlob, callId) => {
    setProcessingStep('Converting speech to text...');
    
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      setProcessingStep('Sending to Friday...');
      
      // Send to backend
      const response = await fetch(`/api/calls/${callId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          sessionId
        })
      });
      
      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
        setCallStatus('ended');
        return;
      }
      
      setUserTranscript(result.transcript);
      setAiResponse(result.aiResponse);
      
      // Play audio response
      if (result.audioBase64) {
        setProcessingStep('Playing response...');
        setCallStatus('playing');
        
        // Create audio from base64
        const audioSrc = `data:${result.format};base64,${result.audioBase64}`;
        audioPlayer.current.src = audioSrc;
        
        audioPlayer.current.onended = () => {
          setCallStatus('ended');
          loadCallHistory(); // Refresh history
        };
        
        await audioPlayer.current.play();
      } else {
        setCallStatus('ended');
      }
      
    } catch (err) {
      console.error('Processing failed:', err);
      setError(err.message);
      setCallStatus('ended');
    }
  };

  // End call/cleanup
  const endCall = useCallback(() => {
    // Stop any playing audio
    if (audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current.currentTime = 0;
    }
    
    // Send end signal to backend
    if (activeCallId) {
      fetch(`/api/calls/${activeCallId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: userTranscript })
      }).catch(console.error);
    }
    
    setActiveCallId(null);
    setCallStatus('ended');
    setCallDuration(0);
    setAudioLevel(0);
    setProcessingStep('');
    loadCallHistory();
  }, [activeCallId, userTranscript]);

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Reset to idle
  const reset = () => {
    setCallStatus('idle');
    setUserTranscript('');
    setAiResponse('');
    setError(null);
    setProcessingStep('');
  };

  return (
    <div className="calls-container">
      {/* Error display */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Recording/Processing/Playing Overlay */}
      {(callStatus === 'recording' || callStatus === 'processing' || callStatus === 'playing') && (
        <div className="active-call-overlay">
          {/* Recording state */}
          {callStatus === 'recording' && (
            <>
              <div className="call-status recording">
                <span className="recording-dot"></span>
                Recording...
              </div>
              
              <div className="call-avatar">
                <div className="avatar-ring" style={{ transform: `scale(${1 + audioLevel * 0.3})` }}>
                  <span>🎤</span>
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
                <div className="call-name">Listening...</div>
                <div className="call-timer">{formatDuration(callDuration)}</div>
              </div>

              <button className="control-btn end-call large" onClick={stopRecording}>
                ⏹ Stop Recording
              </button>
              
              <p className="hint">Tap to stop and send to Friday</p>
            </>
          )}

          {/* Processing state */}
          {callStatus === 'processing' && (
            <>
              <div className="call-status processing">
                <div className="spinner"></div>
                {processingStep}
              </div>
              
              <div className="processing-steps">
                <div className={`step ${processingStep.includes('speech') ? 'active' : 'done'}`}>
                  1. Speech-to-Text
                </div>
                <div className={`step ${processingStep.includes('Sending') ? 'active' : ''}`}>
                  2. AI Thinking
                </div>
                <div className={`step ${processingStep.includes('playing') ? 'active' : ''}`}>
                  3. Text-to-Speech
                </div>
              </div>
            </>
          )}

          {/* Playing state */}
          {callStatus === 'playing' && (
            <>
              <div className="call-status playing">
                🔊 Playing Response
              </div>
              
              <div className="avatar-ring playing">
                <span>F</span>
              </div>
              
              {userTranscript && (
                <div className="transcript-box">
                  <div className="transcript-label">You said:</div>
                  <p>{userTranscript}</p>
                </div>
              )}
              
              {aiResponse && (
                <div className="transcript-box ai">
                  <div className="transcript-label">Friday:</div>
                  <p>{aiResponse}</p>
                </div>
              )}

              <button className="control-btn end-call" onClick={endCall}>
                📞 End
              </button>
            </>
          )}
        </div>
      )}

      {/* Call Ended Screen */}
      {callStatus === 'ended' && (
        <div className="call-ended">
          <div className="ended-icon">📞</div>
          <h3>Call Complete</h3>
          
          {userTranscript && (
            <div className="call-summary">
              <div className="summary-section">
                <label>You said:</label>
                <p>{userTranscript}</p>
              </div>
              <div className="summary-section">
                <label>Friday replied:</label>
                <p>{aiResponse}</p>
              </div>
            </div>
          )}
          
          <button className="new-call-btn" onClick={reset}>
            New Call
          </button>
        </div>
      )}

      {/* Idle: Dialer / Call History */}
      {callStatus === 'idle' && (
        <>
          <div className="dialer-section">
            <div className="dialer-header">
              <h2>Voice Call</h2>
              <p>Press & hold to speak, Friday will respond with voice</p>
            </div>

            <div className="call-button-container">
              <button 
                className="big-call-btn" 
                onClick={startRecording}
                disabled={!sessionId}
              >
                <span className="call-icon">🎤</span>
                <span className="call-text">Press to Speak</span>
              </button>
            </div>

            <div className="voice-features">
              <div className="feature-badge">
                <span>🗣️</span> Azure Speech-to-Text
              </div>
              <div className="feature-badge">
                <span>🤖</span> Azure OpenAI
              </div>
              <div className="feature-badge">
                <span>🔊</span> Azure Text-to-Speech
              </div>
            </div>
          </div>

          <div className="call-history">
            <h3>Recent Voice Calls</h3>
            {callHistory.length === 0 ? (
              <p className="no-calls">No calls yet. Start your first voice conversation!</p>
            ) : (
              <div className="call-list">
                {callHistory.map(call => (
                  <div key={call.id} className={`call-item ${call.status}`}>
                    <div className="call-icon">
                      {call.direction === 'outbound' ? '📤' : '📥'}
                    </div>
                    <div className="call-details">
                      <div className="call-title">
                        {call.transcript 
                          ? `"${call.transcript.slice(0, 40)}${call.transcript.length > 40 ? '...' : ''}"`
                          : 'Voice Call'
                        }
                      </div>
                      <div className="call-meta">
                        {call.duration > 0 
                          ? `${formatDuration(call.duration)} • ${new Date(call.createdAt).toLocaleDateString()}`
                          : new Date(call.createdAt).toLocaleDateString()
                        }
                      </div>
                    </div>
                    <div className="call-actions">
                      <button 
                        className="call-again-btn"
                        onClick={startRecording}
                      >
                        🎤
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
