const axios = require('axios');

class AzureOpenAIProvider {
  constructor() {
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-01';
    this.timeout = 30000; // 30 seconds
    this.status = 'unknown';
    this.lastError = null;
  }

  isConfigured() {
    const configured = !!(this.endpoint && this.apiKey && this.deployment);
    this.status = configured ? 'ready' : 'not_configured';
    return configured;
  }

  getStatus() {
    return {
      provider: 'azure-openai',
      status: this.status,
      configured: this.isConfigured(),
      endpoint: this.endpoint ? `${this.endpoint}/openai/deployments/${this.deployment}` : null,
      lastError: this.lastError,
      timestamp: new Date().toISOString()
    };
  }

  async sendMessage(message, history = []) {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI not configured. Check environment variables.');
    }

    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    // Build messages array from history
    const messages = [
      {
        role: 'system',
        content: 'You are Friday, an AI assistant. Be helpful, concise, and chill. You belong to Zayan.'
      }
    ];

    // Add recent history (last 10 messages)
    if (history && history.length > 0) {
      history.slice(-10).forEach(msg => {
        if (msg.type === 'user') {
          messages.push({ role: 'user', content: msg.content });
        } else if (msg.type === 'ai' && !msg.isMock) {
          messages.push({ role: 'assistant', content: msg.content });
        }
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    try {
      console.log(`[Azure OpenAI] Sending request to ${this.deployment}...`);
      const startTime = Date.now();

      const response = await axios.post(url, {
        messages: messages,
        max_tokens: 800,
        temperature: 0.7,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0
      }, {
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        timeout: this.timeout
      });

      const latency = Date.now() - startTime;
      console.log(`[Azure OpenAI] Response received in ${latency}ms`);

      this.status = 'connected';
      this.lastError = null;

      const assistantMessage = response.data.choices[0]?.message?.content;
      
      if (!assistantMessage) {
        throw new Error('Empty response from Azure OpenAI');
      }

      return {
        content: assistantMessage,
        provider: 'azure-openai',
        model: this.deployment,
        latency: latency,
        usage: response.data.usage
      };

    } catch (error) {
      this.status = 'error';
      this.lastError = error.message;
      
      console.error('[Azure OpenAI] Error:', error.message);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - Azure OpenAI took too long to respond');
      }
      
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data?.error;
        
        if (status === 401) {
          throw new Error('Authentication failed - check API key');
        }
        if (status === 429) {
          throw new Error('Rate limit exceeded - please wait');
        }
        if (status === 404) {
          throw new Error(`Deployment '${this.deployment}' not found`);
        }
        
        throw new Error(`Azure OpenAI error (${status}): ${errorData?.message || error.message}`);
      }
      
      throw new Error(`Azure OpenAI error: ${error.message}`);
    }
  }
}

module.exports = AzureOpenAIProvider;
