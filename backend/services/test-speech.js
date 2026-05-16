#!/usr/bin/env node
/**
 * Standalone Azure Speech test script
 * Run this directly on the server to test Azure Speech connection
 * Usage: node test-speech.js
 */

require('dotenv').config();
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs');
const path = require('path');

console.log('=== Azure Speech Diagnostic Tool ===\n');

// 1. Check configuration
console.log('1. Configuration Check');
console.log('   AZURE_SPEECH_KEY:', process.env.AZURE_SPEECH_KEY ? '***' + process.env.AZURE_SPEECH_KEY.slice(-4) : 'NOT SET');
console.log('   AZURE_SPEECH_REGION:', process.env.AZURE_SPEECH_REGION || 'NOT SET');
console.log('   AZURE_SPEECH_VOICE:', process.env.AZURE_SPEECH_VOICE_NAME || 'en-US-JennyNeural');

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

if (!key || key === 'your_speech_key_here') {
  console.error('\n❌ ERROR: AZURE_SPEECH_KEY is not configured!');
  console.log('   Set it in .env file: AZURE_SPEECH_KEY=your_actual_key');
  process.exit(1);
}

if (!region) {
  console.error('\n❌ ERROR: AZURE_SPEECH_REGION is not configured!');
  process.exit(1);
}

console.log('\n2. Region Validation');
const validRegions = [
  'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
  'centralus', 'northcentralus', 'southcentralus',
  'northeurope', 'westeurope', 'uksouth', 'francecentral',
  'southeastasia', 'eastasia', 'japaneast', 'koreacentral',
  'australiaeast', 'brazilsouth', 'southafricanorth'
];

if (validRegions.includes(region.toLowerCase())) {
  console.log('   ✓ Region "' + region + '" is valid');
} else {
  console.log('   ⚠ Region "' + region + '" may be invalid');
  console.log('   Valid regions:', validRegions.join(', '));
}

// 3. Test network connectivity (HTTP to token endpoint)
console.log('\n3. Network Connectivity Test');
const https = require('https');
const testEndpoint = `https://${region}.api.cognitive.microsoft.com/sts/v1.0`;

console.log('   Testing connection to:', testEndpoint);

https.get(testEndpoint, (res) => {
  console.log('   HTTP Status:', res.statusCode);
  console.log('   ✓ Network connectivity OK');
  
  // 4. Test actual Speech SDK connection
  console.log('\n4. Azure Speech SDK Connection Test');
  testSpeechSDK();
  
}).on('error', (err) => {
  console.error('   ❌ Network connection failed:', err.message);
  console.log('\n   Possible causes:');
  console.log('   - Wrong region');
  console.log('   - Firewall blocking outbound HTTPS');
  console.log('   - Azure Speech service not available in this region');
  process.exit(1);
});

async function testSpeechSDK() {
  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    
    console.log('   SpeechConfig created successfully');
    console.log('   Testing STT connection with synthetic audio...');
    
    // Create a proper silent WAV file (16kHz, 16-bit, mono, 1 second of silence)
    const sampleRate = 16000;
    const durationSeconds = 1;
    const numSamples = sampleRate * durationSeconds;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const fileSize = 36 + dataSize;
    
    const wavBuffer = Buffer.alloc(44 + dataSize);
    
    // RIFF header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(fileSize, 4);
    wavBuffer.write('WAVE', 8);
    
    // fmt chunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size
    wavBuffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
    wavBuffer.writeUInt16LE(1, 22); // NumChannels (mono)
    wavBuffer.writeUInt32LE(sampleRate, 24); // SampleRate
    wavBuffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // ByteRate
    wavBuffer.writeUInt16LE(bytesPerSample, 32); // BlockAlign
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
    
    // data chunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(dataSize, 40);
    
    // Data is already zeros (silence)
    
    const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    let connected = false;
    let errorOccurred = null;
    
    recognizer.canceled = (s, e) => {
      if (!connected) {
        errorOccurred = e;
      }
    };
    
    recognizer.sessionStarted = () => {
      connected = true;
      console.log('   ✓ SDK WebSocket connection established!');
    };
    
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
        
        if (connected) {
          console.log('\n5. Speech Recognition Test');
          console.log('   Result reason:', result.reason);
          console.log('   Result text:', result.text || '(empty)');
          
          if (result.reason === sdk.ResultReason.NoMatch || 
              result.reason === sdk.ResultReason.Canceled) {
            console.log('   ✓ Speech service is working (no speech detected as expected)');
          }
          
          console.log('\n=== ALL TESTS PASSED ===');
          console.log('Azure Speech is configured correctly!');
          process.exit(0);
        } else if (errorOccurred) {
          console.error('\n   ❌ SDK Connection Error:', errorOccurred.errorDetails);
          console.log('\n   Common causes:');
          console.log('   - Invalid key');
          console.log('   - Wrong region for this key');
          console.log('   - Key expired or disabled');
          process.exit(1);
        }
      },
      (err) => {
        recognizer.close();
        console.error('\n   ❌ SDK Error:', err.message || err);
        process.exit(1);
      }
    );
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!connected) {
        console.error('\n   ❌ SDK Connection Timeout (10s)');
        console.log('   Could not establish WebSocket connection');
        recognizer.close();
        process.exit(1);
      }
    }, 10000);
    
  } catch (err) {
    console.error('\n   ❌ SDK Setup Error:', err.message);
    console.log('\n   Stack:', err.stack);
    process.exit(1);
  }
}
