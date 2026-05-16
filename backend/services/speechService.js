const sdk = require('microsoft-cognitiveservices-speech-sdk');

class SpeechService {
  constructor() {
    this.speechKey = process.env.AZURE_SPEECH_KEY;
    this.speechRegion = process.env.AZURE_SPEECH_REGION;
    this.voiceName = process.env.AZURE_SPEECH_VOICE_NAME;
    
    this.enabled = !!(this.speechKey && this.speechRegion);
    
    if (this.enabled) {
      console.log(`[SpeechService] Initialized with region: ${this.speechRegion}`);
    } else {
      console.log('[SpeechService] Disabled - missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  // Speech-to-Text: Convert audio buffer to transcript
  async speechToText(audioBuffer, audioFormat = 'webm') {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create speech config
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechRecognitionLanguage = 'en-US';

        // Push audio buffer to stream
        const pushStream = sdk.AudioInputStream.createPushStream();
        pushStream.write(audioBuffer);
        pushStream.close();

        // Create audio config from stream
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        
        // Create recognizer
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        
        let transcript = '';
        
        recognizer.recognizing = (s, e) => {
          console.log(`[STT] Recognizing: ${e.result.text}`);
        };
        
        recognizer.recognized = (s, e) => {
          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            transcript = e.result.text;
            console.log(`[STT] Recognized: ${transcript}`);
          }
        };
        
        recognizer.canceled = (s, e) => {
          recognizer.stopContinuousRecognitionAsync();
          if (e.reason === sdk.CancellationReason.Error) {
            reject(new Error(`STT Error: ${e.errorDetails}`));
          } else {
            resolve(transcript);
          }
        };
        
        recognizer.sessionStopped = (s, e) => {
          recognizer.stopContinuousRecognitionAsync();
          resolve(transcript);
        };

        // Start recognition
        recognizer.startContinuousRecognitionAsync(
          () => {
            // Auto-stop after silence (handled by Azure)
            // But we need a timeout for end of speech
            setTimeout(() => {
              recognizer.stopContinuousRecognitionAsync(
                () => resolve(transcript),
                (err) => reject(err)
              );
            }, 5000); // 5 second max for speech
          },
          (err) => reject(err)
        );
        
      } catch (err) {
        reject(err);
      }
    });
  }

  // Speech-to-Text: Simple one-shot recognition with timeout
  async recognizeOnce(audioBuffer) {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechRecognitionLanguage = 'en-US';

        // For one-shot, we can use recognizeOnceAsync
        const pushStream = sdk.AudioInputStream.createPushStream();
        pushStream.write(audioBuffer);
        pushStream.close();

        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        recognizer.recognizeOnceAsync(
          (result) => {
            recognizer.close();
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve({
                text: result.text,
                duration: result.duration,
                confidence: result.confidence
              });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              resolve({ text: '', duration: 0, confidence: 0 });
            } else {
              reject(new Error(`Recognition failed: ${result.reason}`));
            }
          },
          (err) => {
            recognizer.close();
            reject(err);
          }
        );
        
      } catch (err) {
        reject(err);
      }
    });
  }

  // Text-to-Speech: Convert text to audio buffer
  async textToSpeech(text) {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechSynthesisVoiceName = this.voiceName;
        
        // Output to memory stream
        const buffer = [];
        const pullStream = sdk.AudioOutputStream.createPullStream();
        
        pullStream.read = (dataBuffer) => {
          // This gets called with synthesized chunks
          return 0; // Indicates we're writing to our own buffer
        };

        // Use synthesizer with array buffer output
        const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        // Use SSML for better control
        const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
            <voice name="${this.voiceName}">
              <prosody pitch="default" rate="1.0" volume="default">
                ${this.escapeXml(text)}
              </prosody>
            </voice>
          </speak>
        `;

        // Store audio chunks
        const audioChunks = [];
        
        synthesizer.synthesizing = (s, e) => {
          if (e.result.audioData) {
            audioChunks.push(Buffer.from(e.result.audioData));
          }
        };

        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            synthesizer.close();
            
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              // Combine all chunks
              const audioBuffer = Buffer.concat(audioChunks);
              
              // If no chunks from event, try result.audioData
              const finalBuffer = audioBuffer.length > 0 
                ? audioBuffer 
                : Buffer.from(result.audioData);
              
              resolve({
                audioBuffer: finalBuffer,
                duration: result.audioDuration,
                format: 'audio/wav'
              });
            } else {
              reject(new Error(`TTS failed: ${result.reason}`));
            }
          },
          (err) => {
            synthesizer.close();
            reject(err);
          }
        );
        
      } catch (err) {
        reject(err);
      }
    });
  }

  // Alternative TTS using toArrayBuffer
  async textToSpeechBuffer(text) {
    if (!this.enabled) {
      throw new Error('Azure Speech Service not configured');
    }

    return new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(this.speechKey, this.speechRegion);
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        
        // Null audio config for in-memory synthesis
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

        const ssml = `
          <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
            <voice name="${this.voiceName}">
              ${this.escapeXml(text)}
            </voice>
          </speak>
        `;

        synthesizer.speakSsmlAsync(
          ssml,
          (result) => {
            synthesizer.close();
            
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              const audioBuffer = Buffer.from(result.audioData);
              console.log(`[TTS] Generated ${audioBuffer.length} bytes of audio`);
              
              resolve({
                audioBuffer,
                audioBase64: audioBuffer.toString('base64'),
                duration: result.audioDuration,
                format: 'audio/mp3'
              });
            } else {
              reject(new Error(`TTS failed: ${result.reason}`));
            }
          },
          (err) => {
            synthesizer.close();
            reject(err);
          }
        );
        
      } catch (err) {
        reject(err);
      }
    });
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
