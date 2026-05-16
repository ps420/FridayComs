import React, { useState, useEffect, useRef, useCallback } from 'react';
import './LiveCallMode.css';

const log = (msg, data) => {
  console.log(`[LiveCall ${new Date().toLocaleTimeString()}] ${msg}`, data || '');
};

// Silence detection threshold (in dB)
const SILENCE_THRESHOLD = -50;
const SILENCE_DURATION_MS = 1500; // 1.5 seconds of silence = end of speech
const MIN_SPEECH_DURATION_MS = 500; // Min 500ms of speech before processing

function LiveCallMode({ sessionId }) {
  const [status, setStatus] = useState('idle'); // idle, listening, thinking, speaking
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callId, setCallId] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastActivity, setLastActivity] = useState(null);
  
  // Refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const audioChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);

  // Start the live call
  const startCall = useCallback(async () => {
    if (!sessionId) {
      setError('No session active. Start a chat first.');
      return;
    }

    try {
      setError(null);
      log('Starting live call...');

      // Create call on backend
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, callType: 'voice' })
      });
      const call = await res.json();
      setCallId(call.id);
      
      await fetch(`/api/calls/${call.id}/start`, { method: 'POST' });
      
      callStartTimeRef.current = Date.now();
      setStatus('listening');

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }, 1000);

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // Set up audio analysis for VAD
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      // Start listening loop
      listenForSpeech();

    } catch (err) {
      log('Start call failed', err.message);
      setError(err.message);
    }
  }, [sessionId]);

  // Voice Activity Detection loop
  const listenForSpeech = useCallback(() => {
    if (!analyserRef.current || status === 'thinking' || status === 'speaking') {
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    
    analyser.getFloatTimeDomainData(dataArray);
    
    // Calculate RMS (volume)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / bufferLength);
    const db = 20 * Math.log10(rms);
    
    // Normalize for display
    const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));
    setAudioLevel(normalizedLevel);

    const now = Date.now();

    // Speech detected
    if (db > SILENCE_THRESHOLD) {
      if (!isSpeakingRef.current) {
        // Speech started
        isSpeakingRef.current = true;
        speechStartRef.current = now;
        silenceStartRef.current = null;
        log('Speech detected', { db: db.toFixed(1) });
        
        // Start recording
        startRecordingChunk();
      } else {
        // Continue speaking
        silenceStartRef.current = null;
      }
    } else {
      // Silence detected
      if (isSpeakingRef.current) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
          // Silence for long enough - end of speech
          const speechDuration = now - speechStartRef.current;
          
          if (speechDuration >= MIN_SPEECH_DURATION_MS) {
            log('End of speech detected', { duration: speechDuration });
            stopRecordingAndProcess();
            return; // Stop the loop
          } else {
            // Too short, discard
            log('Speech too short, discarding', { duration: speechDuration });
            isSpeakingRef.current = false;
            speechStartRef.current = null;
            silenceStartRef.current = null;
          }
        }
      }
    }

    // Continue loop
    animationFrameRef.current = requestAnimationFrame(listenForSpeech);
  }, [status]);

  // Start recording a chunk
  const startRecordingChunk = () => {
    if (!mediaStreamRef.current) return;
    
    audioChunksRef.current = [];
    
    // Try to use supported format
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    
    mediaRecorderRef.current = new MediaRecorder(mediaStreamRef.current, { mimeType });
    
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };
    
    mediaRecorderRef.current.start(100);
    log('Recording chunk started');
  };

  // Stop recording and process
  const stopRecordingAndProcess = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    setStatus('thinking');
    mediaRecorderRef.current.stop();

    // Wait for final data
    await new Promise(resolve => {
      mediaRecorderRef.current.onstop = resolve;
    });

    try {
      const blob = new Blob(audioChunksRef.current, { 
        type: mediaRecorderRef.current.mimeType 
      });
      
      log('Chunk recorded', { size: blob.size });

      // Convert to base64
      const base64 = await blobToBase64(blob);

      // Send to backend
      log('Sending to backend...');
      const response = await fetch(`/api/calls/${callId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          sessionId,
          mimeType: blob.type
        })
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      log('Got response', { 
        transcript: result.transcript,
        hasAudio: !!result.audioBase64 
      });

      setTranscript(result.transcript);
      setAiResponse(result.aiResponse);

      // Play response
      if (result.audioBase64) {
        setStatus('speaking');
        
        // Create WebSocket for streaming speech would be better
        // But for now, play the base64
        const audio = new Audio(`data:${result.format || 'audio/mp3'};base64,${result.audioBase64}`);
        
        audio.onended = () => {
          log('Speech finished, resuming listening');
          setStatus('listening');
          isSpeakingRef.current = false;
          speechStartRef.current = null;
          silenceStartRef.current = null;
          
          // Resume listening
          animationFrameRef.current = requestAnimationFrame(listenForSpeech);
        };
        
        await audio.play();
      } else {
        setStatus('listening');
        isSpeakingRef.current = false;
        animationFrameRef.current = requestAnimationFrame(listenForSpeech);
      }

    } catch (err) {
      log('Processing error', err.message);
      setError(err.message);
      setStatus('listening');
      isSpeakingRef.current = false;
      animationFrameRef.current = requestAnimationFrame(listenForSpeech);
    }
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // End call
  const endCall = useCallback(async () => {
    log('Ending call...');
    
    // Stop all
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
    }

    // End on backend
    if (callId) {
      await fetch(`/api/calls/${callId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript || '' })
      });
    }

    setStatus('idle');
    setCallDuration(0);
    setCallId(null);
    setTranscript('');
    setAiResponse('');
  }, [callId, transcript]);

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
        <p>Continuous conversation. Speak naturally, Friday responds.</p>
      </div>

      {error && (
        <div className="error-box">
          ⚠️ {error}
        </div>
      )}

      {status === 'idle' && (
        <button className="start-call-btn" onClick={startCall}>
          <span>📞</span>
          Start Live Call
        </button>
      )}

      {(status === 'listening' || status === 'thinking' || status === 'speaking') && (
        <div className="active-call">
          <div className="call-header">
            <span className="duration">{formatDuration(callDuration)}</span>
            <button className="end-btn" onClick={endCall}>End</button>
          </div>

          <div className={`status-indicator ${status}`}>
            {status === 'listening' && (
              <>
                <div className="listening-visual">
                  <div className="orb" style={{ transform: `scale(${1 + audioLevel * 0.5})` }}>
                    🎤
                  </div>
                  <div className="waves">
                    {[...Array(3)].map((_, i) => (
                      <div 
                        key={i} 
                        className="wave"
                        style={{ 
                          animationDelay: `${i * 0.2}s`,
                          opacity: 0.3 + audioLevel * 0.7
                        }}
                      />
                    ))}
                  </div>
                </div>
                <p>Listening...</p>
                <span className="sub">Speak naturally</span>
              </>
            )}

            {status === 'thinking' && (
              <>
                <div className="thinking-spinner"></div>
                <p>Thinking...</p>
              </>
            )}

            {status === 'speaking' && (
              <>
                <div className="speaking-indicator">
                  <span className="sound-icon">🔊</span>
                </div>
                <p>Speaking...</p>
              </>
            )}
          </div>

          <div className="conversation">
            {transcript && (
              <div className="msg user">
                <strong>You:</strong> {transcript}
              </div>
            )}
            {aiResponse && status !== 'listening' && (
              <div className="msg assistant">
                <strong>Friday:</strong> {aiResponse}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default LiveCallMode;
