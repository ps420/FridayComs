const AzureOpenAIProvider = require('./azure-openai');
const MockProvider = require('./mock-provider');

class AIProviderManager {
  constructor() {
    this.azureProvider = new AzureOpenAIProvider();
    this.mockProvider = new MockProvider();
    this.mode = process.env.AI_PROVIDER_MODE || 'auto';
    this.currentProvider = null;
  }

  getProvider() {
    // Force mock mode
    if (this.mode === 'mock') {
      return this.mockProvider;
    }
    
    // Force Azure mode
    if (this.mode === 'azure') {
      if (this.azureProvider.isConfigured()) {
        return this.azureProvider;
      }
      throw new Error('Azure OpenAI mode requested but not configured');
    }
    
    // Auto mode: use Azure if configured, otherwise mock
    if (this.mode === 'auto') {
      if (this.azureProvider.isConfigured()) {
        return this.azureProvider;
      }
      return this.mockProvider;
    }
    
    // Default to mock
    return this.mockProvider;
  }

  async sendMessage(message, history = []) {
    const provider = this.getProvider();
    return await provider.sendMessage(message, history);
  }

  getStatus() {
    const azureStatus = this.azureProvider.getStatus();
    const mockStatus = this.mockProvider.getStatus();
    const current = this.getProvider();
    
    return {
      mode: this.mode,
      currentProvider: current === this.azureProvider ? 'azure-openai' : 'mock',
      azure: azureStatus,
      mock: mockStatus,
      available: [
        azureStatus.configured ? 'azure-openai' : null,
        'mock'
      ].filter(Boolean)
    };
  }
}

module.exports = AIProviderManager;
