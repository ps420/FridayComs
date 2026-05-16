import React, { useState, useEffect, useRef, useCallback } from 'react';
import './VoiceNoteMode.css';

// Diagnostic logging helper
const log = (msg, data) => {
  const timestamp = new Date().toISOString();
  console.log(`[VoiceNote ${timestamp}] ${msg}`, data || '');
};

function VoiceNoteMode({ sessionId }) {
  const [status, setStatus] = useState('idle'); // idle, recording, processing, playing, ended
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const [result, setResult] = useState(null);
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const audioPlayer = useRef(new Audio());
  const activeCallId = useRef(null);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!sessionId) {
      setError('No session active. Start a chat first.');
      return;
    }

    setError(null);
    setDebugInfo({});
    setResult(null);
    audioChunks.current = [];

    try {
      // Detect supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      
      log('Detected MIME type:', mimeType || 'browser default');
      setDebugInfo(prev => ({ ...prev, mimeType: mimeType || 'default' }));

      // Get microphone
      log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create recorder
      const options = mimeType ? { mimeType } : {};
      mediaRecorder.current = new MediaRecorder(stream, options);
      
      log('MediaRecorder created', {
        mimeType: mediaRecorder.current.mimeType,
        state: mediaRecorder.current.state
      });

      // Collect chunks
      mediaRecorder.current.ondataavailable = (event) => {
        log('Data available', { size: event.data.size, type: event.data.type });
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      // When stopped, process
      mediaRecorder.current.onstop = async () => {
        log('Recording stopped, processing chunks...', { 
          chunkCount: audioChunks.current.length 
        });
        await processRecording();
      };

      // Start
      mediaRecorder.current.start(100); // Collect every 100ms
      setStatus('recording');
      log('Recording started');

    } catch (err) {
      log('Start recording failed', err.message);
      setError(`Microphone error: ${err.message}`);
    }
  }, [sessionId]);

  // Stop recording
  const stopRecording = useCallback(() => {
    log('Stopping recording...');
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
      // Stop all tracks
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
    setStatus('processing');
  }, []);

  // Process the recording
  const processRecording = async () => {
    try {
      // Create blob
      const blob = new Blob(audioChunks.current, { 
        type: mediaRecorder.current.mimeType || 'audio/webm' 
      });
      
      log('Blob created', { 
        size: blob.size, 
        type: blob.type,
        chunkCount: audioChunks.current.length
      });

      setDebugInfo(prev => ({ 
        ...prev, 
        blobSize: blob.size,
        blobType: blob.type 
      }));

      if (blob.size < 100) {
        throw new Error('Audio too short (<100 bytes)');
      }

      // Create call on backend
      log('Creating call on backend...');
      const callRes = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, callType: 'voice' })
      });
      
      const callData = await callRes.json();
      activeCallId.current = callData.id;
      log('Call created', { callId: callData.id });

      // Convert to base64 using FileReader (more reliable than Buffer)
      log('Converting to base64...');
      const base64 = await blobToBase64(blob);
      
      log('Base64 created', { 
        length: base64.length,
        startsWith: base64.slice(0, 30) + '...'
      });

      setDebugInfo(prev => ({ 
        ...prev, 
        base64Length: base64.length 
      }));

      // Send to backend
      log('Sending to backend /process...');
      const response = await fetch(`/api/calls/${callData.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          sessionId,
          mimeType: blob.type
        })
      });

      const result = await response.json();
      log('Backend response', { status: response.status, hasError: !!result.error });

      if (!response.ok || result.error) {
        throw new Error(result.error || result.message || 'Processing failed');
      }

      log('Processing complete', { 
        transcriptLength: result.transcript?.length,
        responseLength: result.aiResponse?.length,
        hasAudio: !!result.audioBase64
      });

      setResult(result);
      setDebugInfo(prev => ({
        ...prev,
        transcript: result.transcript,
        response: result.aiResponse?.slice(0, 100)
      }));

      // Play audio
      if (result.audioBase64) {
        setStatus('playing');
        const audioSrc = `data:${result.format || 'audio/mp3'};base64,${result.audioBase64}`;
        audioPlayer.current.src = audioSrc;
        
        audioPlayer.current.onended = () => {
          setStatus('ended');
        };
        
        await audioPlayer.current.play();
      } else {
        setStatus('ended');
      }

    } catch (err) {
      log('Processing error', err.message);
      setError(err.message);
      setStatus('ended');
    }
  };

  // Helper: Blob to Base64 using FileReader
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

  const reset = () => {
    setStatus('idle');
    setError(null);
    setResult(null);
    setDebugInfo({});
    audioChunks.current = [];
    activeCallId.current = null;
  };

  return (
    <div className="voice-note-mode">
      <div className="mode-header">
        <h3>🎤 Voice Note Mode</h3>
        <p>Press, speak, release. Friday replies with voice.</p>
      </div>

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Debug info panel */}
      <div className="debug-panel">
        <strong>Debug Info:</strong>
        <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
      </div>

      {/* Recording state */}
      {status === 'idle' && (
        <button className="record-btn" onClick={startRecording}>
          <span>🎤</span>
          Hold to Record
        </button>
      )}

      {status === 'recording' && (
        <button className="record-btn recording" onClick={stopRecording}>
          <span className="pulse">⏹</span>
          Recording... Click to Stop
        </button>
      )}

      {status === 'processing' && (
        <div className="processing-state">
          <div className="spinner"></div>
          <p>Processing...</p>
          <p className="sub">Speech → Text → AI → Voice</p>
        </div>
      )}

      {status === 'playing' && (
        <div className="playing-state">
          <div className="audio-playing">
            <span className="sound-wave">🔊</span>
            Playing response...
          </div>
          {result && (
            <div className="transcript">
              <p><strong>You:</strong> {result.transcript}</p>
              <p><strong>Friday:</strong> {result.aiResponse}</p>
            </div>
          )}
        </div>
      )}

      {status === 'ended' && (
        <div className="ended-state">
          {result ? (
            <>
              <div className="result-box">
                <p><strong>You said:</strong> {result.transcript}</p>
                <p><strong>Friday replied:</strong> {result.aiResponse}</p>
              </div>
              {result.audioBase64 && (
                <p className="success">✓ Voice response played</p>
              )}
            </>
          ) : (
            <p>Recording ended before processing.</p>
          )}
          <button className="reset-btn" onClick={reset}>
            Record Another
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceNoteMode;
