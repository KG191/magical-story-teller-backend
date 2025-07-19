#!/usr/bin/env node

// Test script for Railway deployment
// Usage: node test-deployment.js [RAILWAY_URL]

import axios from 'axios';

const RAILWAY_URL = process.argv[2] || 'http://localhost:3001';
const API_BASE = `${RAILWAY_URL}/api`;

console.log('🧪 Testing Magical Story Teller Backend Deployment');
console.log(`🔗 API Base URL: ${API_BASE}`);
console.log('');

async function testHealthEndpoint() {
  try {
    console.log('1️⃣ Testing health endpoint...');
    const response = await axios.get(`${API_BASE}/health`);
    
    if (response.status === 200 && response.data.status === 'ok') {
      console.log('✅ Health check: PASSED');
      return true;
    } else {
      console.log('❌ Health check: FAILED');
      console.log('Response:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testStoryGeneration() {
  try {
    console.log('2️⃣ Testing story generation endpoint...');
    
    const testPayload = {
      prompt: "A magical unicorn in an enchanted forest",
      language: "English (US)",
      voiceName: "en-US-Studio-O",
      animationStyle: "Disney/Pixar 3D Animation"
    };
    
    const response = await axios.post(`${API_BASE}/generate-story`, testPayload, {
      timeout: 60000 // 60 second timeout
    });
    
    if (response.status === 200 && response.data.frames && response.data.frames.length > 0) {
      console.log('✅ Story generation: PASSED');
      console.log(`📚 Generated ${response.data.frames.length} story frames`);
      console.log(`📖 Title: ${response.data.title}`);
      return true;
    } else {
      console.log('❌ Story generation: FAILED');
      console.log('Response:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Story generation: ERROR');
    console.log('Error:', error.message);
    if (error.code === 'ECONNABORTED') {
      console.log('💡 This might be normal for the first request (cold start)');
    }
    return false;
  }
}

async function testImageGeneration() {
  try {
    console.log('3️⃣ Testing image generation endpoint...');
    
    const testPayload = {
      prompt: "A friendly dragon in a magical castle",
      language: "English (US)",
      animationStyle: "Studio Ghibli"
    };
    
    const response = await axios.post(`${API_BASE}/generate-image`, testPayload, {
      timeout: 30000 // 30 second timeout
    });
    
    if (response.status === 200 && typeof response.data === 'string' && response.data.startsWith('http')) {
      console.log('✅ Image generation: PASSED');
      console.log(`🖼️ Image URL: ${response.data.substring(0, 50)}...`);
      return true;
    } else {
      console.log('❌ Image generation: FAILED');
      console.log('Response:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Image generation: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function testTTSEndpoint() {
  try {
    console.log('4️⃣ Testing TTS endpoint...');
    
    const testPayload = {
      text: "Hello, this is a test of the text-to-speech system.",
      languageCode: "en-US",
      voiceName: "en-US-Studio-O"
    };
    
    const response = await axios.post(`${API_BASE}/tts`, testPayload, {
      responseType: 'arraybuffer',
      timeout: 15000 // 15 second timeout
    });
    
    if (response.status === 200 && response.data.byteLength > 0) {
      console.log('✅ TTS endpoint: PASSED');
      console.log(`🔊 Audio size: ${response.data.byteLength} bytes`);
      return true;
    } else {
      console.log('❌ TTS endpoint: FAILED');
      return false;
    }
  } catch (error) {
    console.log('❌ TTS endpoint: ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive backend tests...\n');
  
  const results = [];
  
  // Test health endpoint (required for Railway health checks)
  results.push(await testHealthEndpoint());
  console.log('');
  
  // Test story generation (core feature)
  results.push(await testStoryGeneration());
  console.log('');
  
  // Test image generation (core feature)
  results.push(await testImageGeneration());
  console.log('');
  
  // Test TTS (core feature)
  results.push(await testTTSEndpoint());
  console.log('');
  
  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log('📊 TEST SUMMARY');
  console.log('================');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED! Backend is ready for production.');
    console.log('🔗 Update your iOS app to use this endpoint:', API_BASE);
  } else {
    console.log('⚠️  Some tests failed. Check logs and environment variables.');
    console.log('💡 Health check must pass for Railway deployment to succeed.');
  }
  
  return passed === total;
}

// Run tests
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
  });