import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LiveCallMode.css';

// Debug logger
const log = (msg, data) => {
  const line = `[LiveCall ${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line, data || '');
  return line;
};

// Thresholds
const SILENCE_THRESHOLD_DB = -45;
const SILENCE_DURATION_MS = 2500;
const MIN_SPEECH_MS = 400;
const MAX_TURN_MS = 30000;
const BARGE_IN_THRESHOLD_DB = -35; // Louder threshold for interrupting

function LiveCallMode({ sessionId }) {
  // UI State
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  
  // Debug State (visible to user)
  const [debug, setDebug] = useState({
    micPermission: 'unknown',
    state: 'idle',
    chunkCount: 0,
    volumeDb: -100,
    silenceMs: 0,
    lastBlobSize: 0,
    lastTranscript: '',
    lastAiReply: '',
    lastError: '',
    turnCount: 0,
    bargeInEnabled: true
  });

  // Refs (not triggering re-renders)
  const callIdRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const animationFrameRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const audioPlayerRef = useRef(null); // For barge-in interrupt
  const isInterruptedRef = useRef(false); // Track if current turn was interrupted
  
  // VAD state refs
  const isSpeakingRef = useRef(false);
  const speechStartTimeRef = useRef(null);
  const silenceStartTimeRef = useRef(null);
  const audioChunksRef = useRef([]);
  const turnStartTimeRef = useRef(null);
  const lastTranscriptRef = useRef('');
  const lastAiReplyRef = useRef('');

  // Update debug helper
  const updateDebug = useCallback((updates) => {
    setDebug(prev => ({ ...prev, ...updates }));
  }, []);

  // Start call
  const startCall = useCallback(async () => {
    if (!sessionId) {
      setError('No session active. Start a chat session first.');
      return;
    }

    log('=== STARTING LIVE CALL WITH BARGE-IN ===');
    setError(null);
    
    try {
      updateDebug({ micPermission: 'requesting' });
      
      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      
      mediaStreamRef.current = stream;
      updateDebug({ micPermission: 'granted' });
      log('Microphone permission granted');

      // Create call on backend
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, callType: 'voice' })
      });
      const call = await res.json();
      callIdRef.current = call.id;
      log('Call created', { callId: call.id });

      // Start duration timer
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      // Setup audio context for VAD
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.5;
      source.connect(analyserRef.current);

      // Enter listening state
      setStatus('listening');
      updateDebug({ state: 'listening', turnCount: 0 });
      
      // Start VAD loop (runs continuously including during TTS)
      startVADLoop();

    } catch (err) {
      log('Start call FAILED', err.message);
      updateDebug({ micPermission: 'denied', lastError: err.message });
      setError(`Microphone access failed: ${err.message}`);
    }
  }, [sessionId, updateDebug]);

  // VAD Loop - runs continuously for barge-in detection
  const startVADLoop = useCallback(() => {
    log('VAD loop starting (with barge-in enabled)');
    
    const loop = () => {
      if (!analyserRef.current) return;
      
      const analyser = analyserRef.current;
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      
      analyser.getFloatTimeDomainData(dataArray);
      
      // Calculate RMS and dB
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      
      const now = Date.now();
      
      // Update volume display
      updateDebug({ volumeDb: Math.round(db) });
      
      // BARGE-IN DETECTION: Check if user is speaking during TTS playback
      if (status === 'speaking' && !isSpeakingRef.current) {
        // Use higher threshold for barge-in (need to speak louder to interrupt)
        const isBargeIn = db > BARGE_IN_THRESHOLD_DB;
        
        if (isBargeIn) {
          log('🛑 BARGE-IN DETECTED', { db: db.toFixed(1) });
          handleBargeIn();
          // Don't return - continue loop
        }
      }
      
      // NORMAL SPEECH DETECTION (only when listening)
      if (status === 'listening') {
        const isSpeech = db > SILENCE_THRESHOLD_DB;
        
        if (isSpeech) {
          // SPEECH DETECTED
          if (!isSpeakingRef.current) {
            // Speech STARTED
            isSpeakingRef.current = true;
            speechStartTimeRef.current = now;
            silenceStartTimeRef.current = null;
            turnStartTimeRef.current = now;
            isInterruptedRef.current = false;
            
            log('🎤 SPEECH STARTED', { db: db.toFixed(1) });
            updateDebug({ 
              state: 'recording',
              silenceMs: 0,
              chunkCount: 0 
            });
            
            // Start MediaRecorder
            startRecording();
          } else {
            // Speech CONTINUING - reset silence
            silenceStartTimeRef.current = null;
            updateDebug({ silenceMs: 0 });
          }
        } else {
          // SILENCE DETECTED
          if (isSpeakingRef.current) {
            if (!silenceStartTimeRef.current) {
              silenceStartTimeRef.current = now;
            }
            
            const silenceMs = now - silenceStartTimeRef.current;
            updateDebug({ silenceMs });
            
            // Check if silence duration triggered
            if (silenceMs > SILENCE_DURATION_MS) {
              const speechDuration = now - speechStartTimeRef.current;
              
              if (speechDuration >= MIN_SPEECH_MS) {
                // VALID SPEECH SEGMENT - PROCESS IT
                log('⏹️ SILENCE DETECTED - Ending turn', { 
                  speechDuration, 
                  silenceMs 
                });
                
                // Stop VAD loop temporarily
                if (animationFrameRef.current) {
                  cancelAnimationFrame(animationFrameRef.current);
                  animationFrameRef.current = null;
                }
                
                // Process this turn
                processTurn();
                return; // Exit loop
                
              } else {
                // TOO SHORT - DISCARD
                log('⚠️ Speech too short, discarding', { duration: speechDuration });
                isSpeakingRef.current = false;
                speechStartTimeRef.current = null;
                silenceStartTimeRef.current = null;
                
                // Stop recording without processing
                if (mediaRecorderRef.current?.state === 'recording') {
                  mediaRecorderRef.current.stop();
                }
                
                updateDebug({ 
                  state: 'listening',
                  silenceMs: 0,
                  chunkCount: 0,
                  lastError: 'Speech too short, try again'
                });
              }
            }
          }
        }
      }
      
      // Continue loop (always runs for barge-in detection)
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [status, updateDebug]);

  // Handle barge-in (interrupt TTS)
  const handleBargeIn = () => {
    log('🔇 INTERRUPTING - Stopping TTS playback');
    
    isInterruptedRef.current = true;
    
    // Stop audio playback
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      log('TTS audio stopped');
    }
    
    // Immediately start listening for new speech
    setStatus('listening');
    updateDebug({ 
      state: 'listening',
      lastError: 'Interrupted - listening...'
    });
    
    // Reset speech detection for new input
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    silenceStartTimeRef.current = null;
    audioChunksRef.current = [];
  };

  // Start recording
  const startRecording = () => {
    if (!mediaStreamRef.current) return;
    
    // Reset chunks
    audioChunksRef.current = [];
    
    // Detect best MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg';
    
    log('Starting MediaRecorder', { mimeType });
    
    try {
      mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, { 
        mimeType,
        audioBitsPerSecond: 16000 
      });
      
      // ON DATA AVAILABLE
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          updateDebug({ chunkCount: audioChunksRef.current.length });
          log('Chunk received', { 
            size: e.data.size, 
            totalChunks: audioChunksRef.current.length 
          });
        }
      };
      
      // ON ERROR
      mediaRecorderRef.current.onerror = (err) => {
        log('MediaRecorder ERROR', err.message);
        updateDebug({ lastError: `Recorder: ${err.message}` });
      };
      
      // Start with 100ms timeslice to collect data regularly
      mediaRecorderRef.current.start(100);
      
    } catch (err) {
      log('MediaRecorder start FAILED', err.message);
      updateDebug({ lastError: err.message });
    }
  };

  // Process one turn (Speech -> STT -> AI -> TTS -> Play)
  const processTurn = async () => {
    setStatus('thinking');
    updateDebug({ state: 'processing' });
    
    const turnNum = debug.turnCount + 1;
    log(`=== PROCESSING TURN #${turnNum} ===`);
    
    try {
      // 1. STOP RECORDING
      log('Stopping recorder...');
      
      if (mediaRecorderRef.current?.state === 'recording') {
        // Get final data
        await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = resolve;
          mediaRecorderRef.current.stop();
        });
      }
      
      // 2. CREATE BLOB
      const blob = new Blob(audioChunksRef.current, { 
        type: mediaRecorderRef.current?.mimeType || 'audio/webm' 
      });
      
      updateDebug({ lastBlobSize: blob.size });
      log('Blob created', { size: blob.size, type: blob.type });
      
      // Validate blob
      if (blob.size < 100) {
        throw new Error(`Audio too small: ${blob.size} bytes`);
      }
      
      // 3. CONVERT TO BASE64
      log('Converting to base64...');
      const base64 = await blobToBase64(blob);
      log('Base64 ready', { length: base64.length });
      
      // 4. SEND TO BACKEND
      log('Sending to /api/calls/process...');
      const response = await fetch(`/api/calls/${callIdRef.current}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          sessionId,
          mimeType: blob.type
        })
      });
      
      const result = await response.json();
      
      if (!response.ok || result.error) {
        // Build detailed error message from backend response
        const errorDetail = result.step ? `[${result.step.toUpperCase()} failed] ` : '';
        const errorMessage = result.message || result.error || 'Backend error';
        throw new Error(`${errorDetail}${errorMessage}${result.details ? ': ' + result.details : ''}`);
      }
      
      // 5. UPDATE STATE WITH RESULTS
      lastTranscriptRef.current = result.transcript || '';
      lastAiReplyRef.current = result.aiResponse || '';
      
      // Update session ID if backend returned one (for auto-created sessions)
      if (result.sessionId && result.sessionId !== sessionId) {
        log('Session updated', { old: sessionId, new: result.sessionId });
      }
      
      updateDebug({
        lastTranscript: result.transcript?.slice(0, 100) || '',
        lastAiReply: result.aiResponse?.slice(0, 100) || '',
        turnCount: turnNum
      });
      
      log('Got response', { 
        transcript: result.transcript,
        aiReplyLength: result.aiResponse?.length,
        sessionId: result.sessionId 
      });
      
      // 6. PLAY TTS RESPONSE (with barge-in support)
      if (result.audioBase64) {
        setStatus('speaking');
        updateDebug({ state: 'speaking' });
        
        log('Playing TTS audio... (speak louder to interrupt)');
        
        const audioSrc = `data:${result.format || 'audio/mp3'};base64,${result.audioBase64}`;
        audioPlayerRef.current = new Audio(audioSrc);
        
        await new Promise((resolve, reject) => {
          audioPlayerRef.current.onended = () => {
            if (!isInterruptedRef.current) {
              log('TTS playback complete (not interrupted)');
            }
            resolve();
          };
          audioPlayerRef.current.onerror = (err) => {
            log('TTS playback ERROR', err);
            reject(err);
          };
          audioPlayerRef.current.play().catch(reject);
        });
        
      } else {
        log('No TTS audio received');
      }
      
      // 7. RESET FOR NEXT TURN (only if not already interrupted and barge-in happened)
      if (status !== 'listening') {
        log('Resetting for next turn...');
        
        isSpeakingRef.current = false;
        speechStartTimeRef.current = null;
        silenceStartTimeRef.current = null;
        audioChunksRef.current = [];
        isInterruptedRef.current = false;
        
        setStatus('listening');
        updateDebug({ 
          state: 'listening',
          silenceMs: 0,
          chunkCount: 0
        });
        
        // Restart VAD loop (in case it stopped)
        if (!animationFrameRef.current) {
          startVADLoop();
        }
      }
      
    } catch (err) {
      log('Turn processing FAILED', err.message);
      updateDebug({ 
        lastError: err.message,
        state: 'error' 
      });
      setError(`Turn failed: ${err.message}`);
      
      // Try to recover
      setTimeout(() => {
        isSpeakingRef.current = false;
        setStatus('listening');
        updateDebug({ state: 'listening' });
        if (!animationFrameRef.current) {
          startVADLoop();
        }
      }, 2000);
    }
  };

  // Helper: Blob to Base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // End call
  const endCall = useCallback(async () => {
    log('=== ENDING CALL ===');
    
    // Stop all
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
    }
    
    // End on backend
    if (callIdRef.current) {
      await fetch(`/api/calls/${callIdRef.current}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript: lastTranscriptRef.current 
        })
      });
    }
    
    // Reset state
    setStatus('idle');
    setCallDuration(0);
    setError(null);
    updateDebug({
      micPermission: 'unknown',
      state: 'idle',
      chunkCount: 0,
      volumeDb: -100,
      silenceMs: 0,
      lastBlobSize: 0,
      lastError: ''
    });
    
    // Clear refs
    callIdRef.current = null;
    isSpeakingRef.current = false;
    isInterruptedRef.current = false;
    audioChunksRef.current = [];
    
  }, [updateDebug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="live-call-mode">
      <div className="mode-header">
        <h3>📞 Live Call Mode</h3>
        <p>Continuous conversation with barge-in. Speak louder to interrupt Friday.</p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Debug Panel */}
      <div className="debug-panel">
        <h4>🔍 Live Diagnostics</h4>
        <div className="debug-grid">
          <div className="debug-row">
            <span className="label">Mic:</span>
            <span className={`value ${debug.micPermission}`}>{debug.micPermission}</span>
          </div>
          <div className="debug-row">
            <span className="label">State:</span>
            <span className={`value state-${debug.state}`}>{debug.state}</span>
          </div>
          <div className="debug-row">
            <span className="label">Volume:</span>
            <span className="value">{debug.volumeDb} dB</span>
            <div className="volume-bar">
              <div 
                className="volume-fill" 
                style={{ 
                  width: `${Math.max(0, (debug.volumeDb + 60) / 60 * 100)}%`,
                  background: debug.volumeDb > SILENCE_THRESHOLD_DB ? '#44ff44' : '#667eea'
                }}
              />
            </div>
          </div>
          <div className="debug-row">
            <span className="label">Silence:</span>
            <span className="value">{debug.silenceMs}ms</span>
          </div>
          <div className="debug-row">
            <span className="label">Chunks:</span>
            <span className="value">{debug.chunkCount}</span>
          </div>
          <div className="debug-row">
            <span className="label">Turns:</span>
            <span className="value">{debug.turnCount}</span>
          </div>
          <div className="debug-row">
            <span className="label">Barge-in:</span>
            <span className="value" style={{ color: '#44ff44' }}>✓ Enabled</span>
          </div>
          {debug.lastTranscript && (
            <div className="debug-row transcript">
              <span className="label">You:</span>
              <span className="value">"{debug.lastTranscript}"</span>
            </div>
          )}
          {debug.lastAiReply && (
            <div className="debug-row transcript">
              <span className="label">Friday:</span>
              <span className="value">"{debug.lastAiReply}"</span>
            </div>
          )}
          {debug.lastError && (
            <div className="debug-row error">
              <span className="label">Error:</span>
              <span className="value">{debug.lastError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Idle State */}
      {status === 'idle' && (
        <button className="start-call-btn" onClick={startCall}>
          <span>📞</span>
          Start Live Call
        </button>
      )}

      {/* Active Call */}
      {(status === 'listening' || status === 'thinking' || status === 'speaking') && (
        <div className="active-call">
          <div className="call-header">
            <span className="duration">{formatDuration(callDuration)}</span>
            <button className="end-btn" onClick={endCall}>End Call</button>
          </div>

          <div className={`status-display ${status}`}>
            {status === 'listening' && (
              <>
                <div className="status-icon">🎤</div>
                <p>Listening...</p>
                <span className="hint">Speak naturally (pause 2.5s when done)</span>
              </>
            )}
            
            {status === 'thinking' && (
              <>
                <div className="spinner"></div>
                <p>Thinking...</p>
                <span className="hint">STT → AI → TTS</span>
              </>
            )}
            
            {status === 'speaking' && (
              <>
                <div className="speaking-indicator">
                  <span className="sound-icon">🔊</span>
                </div>
                <p>Speaking...</p>
                <span className="hint">🎙️ SPEAK LOUDER TO INTERRUPT</span>
              </>
            )}
          </div>

          {/* Current turn transcript */}
          {(lastTranscriptRef.current || lastAiReplyRef.current) && (
            <div className="current-turn">
              {lastTranscriptRef.current && (
                <div className="turn-msg user">
                  <strong>You:</strong> {lastTranscriptRef.current}
                </div>
              )}
              {lastAiReplyRef.current && status !== 'listening' && (
                <div className="turn-msg assistant">
                  <strong>Friday:</strong> {lastAiReplyRef.current}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LiveCallMode;
