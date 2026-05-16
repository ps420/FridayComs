class MockProvider {
  constructor() {
    this.status = 'ready';
    this.lastError = null;
  }

  isConfigured() {
    return true; // Always available as fallback
  }

  getStatus() {
    return {
      provider: 'mock',
      status: this.status,
      configured: true,
      endpoint: null,
      lastError: null,
      timestamp: new Date().toISOString()
    };
  }

  async sendMessage(message, history = []) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
      return {
        content: "[MOCK] Hey there! I'm in mock mode. Real Azure OpenAI coming online soon.",
        provider: 'mock',
        model: 'mock',
        latency: 100,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
    
    if (lowerMsg.includes('status')) {
      return {
        content: "[MOCK] System Status:\n• Backend: Connected ✓\n• WebSocket: Connected ✓\n• AI: MOCK MODE (fallback)\n• Azure OpenAI: Check Settings panel for status",
        provider: 'mock',
        model: 'mock',
        latency: 100,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
    
    if (lowerMsg.includes('azure') || lowerMsg.includes('openai')) {
      return {
        content: "[MOCK] Azure OpenAI integration is being configured. Check that environment variables are set:",
        provider: 'mock',
        model: 'mock',
        latency: 100,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    }
    
    const responses = [
      "[MOCK] This is a simulated response. Azure OpenAI connection pending.",
      "[MOCK] Chat interface working! Backend ready for real AI integration.",
      "[MOCK] FridayComs backend ✓ | WebSocket ✓ | AI (mock fallback active)",
      "[MOCK] UI test mode active. Real Azure OpenAI provider ready for config."
    ];
    
    return {
      content: responses[Math.floor(Math.random() * responses.length)],
      provider: 'mock',
      model: 'mock',
      latency: 100,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }
}

module.exports = MockProvider;
