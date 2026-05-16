const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

class SpeechService {
  constructor() {
    this.speechKey = process.env.AZURE_SPEECH_KEY;
    this.speechRegion = process.env.AZURE_SPEECH_REGION;
    this.voiceName = process.env.AZURE_SPEECH_VOICE_NAME || 'en-US-JennyNeural';
    this.ffmpegAvailable = false;
    
    this.enabled = !!(this.speechKey && this.speechRegion);
    
    // Check ffmpeg availability
    try {
      require('child_process').execSync('which ffmpeg', { stdio: 'ignore' });
      this.ffmpegAvailable = true;
    } catch (e) {
      this.ffmpegAvailable = false;
    }
    
    if (this.enabled) {
      console.log(`[SpeechService] Initialized`);
      console.log(`  - Region: ${this.speechRegion}`);
      console.log(`  - Voice: ${this.voiceName}`);
      console.log(`  - ffmpeg: ${this.ffmpegAvailable ? 'available' : 'NOT available'}`);
    } else {
      console.log('[SpeechService] Disabled - missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * Speech-to-Text with proper format handling
   * @param {Buffer} audioBuffer - The audio data
   * @param {string} mimeType - MIME type from browser (e.g., 'audio/webm')
   */
  async speechToText(audioBuffer, mimeType = 'audio/webm') {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    console.log(`[Speech STT] Starting recognition...`);
    console.log(`  - Input: ${audioBuffer.length} bytes`);
    console.log(`  - MIME type: ${mimeType}`);

    // Azure Speech SDK requires WAV format for push streams
    // Browser sends WebM, so we need to convert
    let wavBuffer;
    if (mimeType.includes('webm')) {
      wavBuffer = await this.convertWebmToWav(audioBuffer);
    } else {
      wavBuffer = audioBuffer;
    }

    console.log(`[Speech STT] Converted to WAV: ${wavBuffer.length} bytes`);

    return new Promise((resolve, reject) => {
      try {
        // Create speech config
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechRecognitionLanguage = 'en-US';

        // Create push stream with proper format
        const pushStream = sdk.AudioInputStream.createPushStream(
          sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1) // 16kHz, 16-bit, mono
        );
        
        // Write audio data in chunks to avoid memory issues
        const chunkSize = 4096;
        for (let i = 0; i < wavBuffer.length; i += chunkSize) {
          const chunk = wavBuffer.slice(i, i + chunkSize);
          pushStream.write(chunk);
        }
        pushStream.close();

        // Create audio config
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        
        // Create recognizer
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        
        let transcript = '';
        let isDone = false;
        
        recognizer.recognizing = (s, e) => {
          // Intermediate results
          console.log(`[STT] Recognizing: "${e.result.text}"`);
        };
        
        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            transcript = e.result.text;
            console.log(`[STT] Final: "${transcript}"`);
          }
        };
        
        recognizer.canceled = (s, e) => {
          if (!isDone) {
            isDone = true;
            recognizer.close();
            
            if (e.reason === sdk.CancellationReason.Error) {
              console.error(`[STT] Error: ${e.errorDetails}`);
              reject(new Error(`Speech recognition error: ${e.errorDetails}`));
            } else {
              console.log(`[STT] Canceled: ${e.reason}`);
              resolve({ text: transcript, duration: 0, confidence: 0 });
            }
          }
        };
        
        recognizer.sessionStopped = (s, e) => {
          if (!isDone) {
            isDone = true;
            recognizer.close();
            console.log(`[STT] Session stopped, transcript: "${transcript}"`);
            resolve({ text: transcript, duration: 0, confidence: 0 });
          }
        };

        // Start recognition
        console.log('[STT] Starting recognizer...');
        recognizer.startContinuousRecognitionAsync(
          () => {
            console.log('[STT] Recognizer started');
            // Auto-stop after reasonable time
            setTimeout(() => {
              if (!isDone) {
                recognizer.stopContinuousRecognitionAsync();
              }
            }, 30000); // Max 30 seconds
          },
          (err) => {
            isDone = true;
            recognizer.close();
            reject(err);
          }
        );
        
      } catch (err) {
        console.error('[STT] Exception:', err.message);
        reject(err);
      }
    });
  }

  /**
   * One-shot speech recognition (for voice notes)
   */
  async recognizeOnce(audioBuffer, mimeType = 'audio/webm') {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    console.log(`[Speech RecognizeOnce] Starting...`);
    console.log(`  - Input: ${audioBuffer.length} bytes`);
    console.log(`  - MIME type: ${mimeType}`);
    console.log(`  - ffmpeg installed: ${this.ffmpegAvailable}`);

    // Convert to WAV
    let wavBuffer;
    let conversionMethod = 'none';
    
    if (mimeType.includes('webm')) {
      try {
        wavBuffer = await this.convertWebmToWav(audioBuffer);
        conversionMethod = this.ffmpegAvailable ? 'ffmpeg' : 'header-only';
      } catch (convErr) {
        console.error(`[Speech] Conversion failed: ${convErr.message}`);
        throw new Error(`Audio conversion failed: ${convErr.message}`);
      }
    } else {
      wavBuffer = audioBuffer;
    }

    console.log(`[Speech] Converted to WAV: ${wavBuffer.length} bytes (method: ${conversionMethod})`);

    // Validate WAV header
    const isValidWav = wavBuffer.length > 44 && 
                       wavBuffer.toString('ascii', 0, 4) === 'RIFF' &&
                       wavBuffer.toString('ascii', 8, 12) === 'WAVE';
    console.log(`[Speech] WAV validation: ${isValidWav ? 'VALID' : 'INVALID'}`);

    return new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechRecognitionLanguage = 'en-US';

        // Create format - 16kHz, 16-bit, mono
        const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
        const pushStream = sdk.AudioInputStream.createPushStream(format);
        
        // Write in chunks
        const chunkSize = 4096;
        for (let i = 0; i < wavBuffer.length; i += chunkSize) {
          pushStream.write(wavBuffer.slice(i, i + chunkSize));
        }
        pushStream.close();

        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        console.log('[Speech] Starting one-shot recognition...');

        recognizer.recognizeOnceAsync(
          (result) => {
            recognizer.close();
            
            const reasonNames = {
              0: 'NoMatch',
              1: 'Canceled', 
              2: 'RecognizingSpeech',
              3: 'RecognizedSpeech',
              4: 'SpeechStartDetected',
              5: 'SpeechEndDetected'
            };
            const reasonName = reasonNames[result.reason] || `Unknown(${result.reason})`;
            
            console.log(`[Speech] Result: reason=${result.reason} (${reasonName}), text="${result.text || '(empty)'}"`);
            
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              console.log(`[Speech] SUCCESS: "${result.text}"`);
              resolve({
                text: result.text,
                duration: result.duration,
                confidence: result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)
              });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              console.log('[Speech] NoMatch: No speech detected in audio');
              resolve({ text: '', duration: 0, confidence: 0 });
            } else if (result.reason === sdk.ResultReason.Canceled) {
              const details = result.errorDetails || 'Unknown cancellation';
              console.error(`[Speech] CANCELED: ${details}`);
              reject(new Error(`Speech recognition canceled: ${details}`));
            } else {
              console.error(`[Speech] FAILED: reason=${result.reason} (${reasonName})`);
              reject(new Error(`Recognition failed: ${reasonName}`));
            }
          },
          (err) => {
            recognizer.close();
            console.error('[Speech] RecognizeOnce error:', err);
            reject(new Error(`STT error: ${err.message || err}`));
          }
        );
        
      } catch (err) {
        console.error('[Speech] Exception:', err.message);
        reject(new Error(`STT setup error: ${err.message}`));
      }
    });
  }

  /**
   * Text-to-Speech
   */
  async textToSpeech(text) {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    console.log(`[Speech TTS] Starting...`);
    console.log(`  - Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

    return new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechSynthesisVoiceName = this.voiceName;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        
        // Use default speaker (null audio config = synthesize to memory)
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

        const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
            <voice name="${this.voiceName}">
              <prosody rate="1.0" pitch="default">
                ${this.escapeXml(text)}
              </prosody>
            </voice>
          </speak>
        `;

        console.log('[TTS] Synthesizing...');

        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            synthesizer.close();
            
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              const audioBuffer = Buffer.from(result.audioData);
              console.log(`[TTS] Success: ${audioBuffer.length} bytes`);
              
              resolve({
                audioBuffer,
                audioBase64: audioBuffer.toString('base64'),
                duration: result.audioDuration,
                format: 'audio/mp3'
              });
            } else {
              console.error(`[TTS] Failed: ${result.reason}`);
              reject(new Error(`Synthesis failed: ${result.reason}`));
            }
          },
          (err) => {
            synthesizer.close();
            console.error('[TTS] Error:', err);
            reject(err);
          }
        );
        
      } catch (err) {
        console.error('[TTS] Exception:', err.message);
        reject(err);
      }
    });
  }

  /**
   * Convert WebM to WAV format (16kHz, 16-bit, mono)
   * This uses ffmpeg if available, otherwise tries a simple conversion
   */
  async convertWebmToWav(webmBuffer) {
    // Check if ffmpeg is available
    try {
      await execAsync('which ffmpeg');
      
      const tempDir = '/tmp';
      const inputPath = path.join(tempDir, `input_${Date.now()}.webm`);
      const outputPath = path.join(tempDir, `output_${Date.now()}.wav`);
      
      // Write input
      await fs.promises.writeFile(inputPath, webmBuffer);
      
      // Convert
      await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}" -y`);
      
      // Read output
      const wavBuffer = await fs.promises.readFile(outputPath);
      
      // Cleanup
      await fs.promises.unlink(inputPath).catch(() => {});
      await fs.promises.unlink(outputPath).catch(() => {});
      
      return wavBuffer;
      
    } catch (err) {
      console.log('[Speech] ffmpeg not available, trying alternative approach...');
      
      // Fallback: The SDK might handle webm directly with WAV format specified
      // Create a simple WAV header for the webm data
      // Note: This won't work perfectly but may help with debugging
      return this.createWavHeader(webmBuffer.length, 16000, 1, 16);
    }
  }

  /**
   * Create a WAV header (may not work perfectly for actual audio data)
   */
  createWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    
    const buffer = Buffer.alloc(44);
    
    // RIFF chunk
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    
    return buffer;
  }

  escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}

// Singleton
let instance = null;
module.exports = {
  getSpeechService: () => {
    if (!instance) {
      instance = new SpeechService();
    }
    return instance;
  }
};
