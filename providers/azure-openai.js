const axios = require('axios');

class AzureOpenAIProvider {
  constructor() {
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    this.apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    this.timeout = 60000; // 60 seconds for streaming
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

  // Non-streaming send (for simple responses)
  async sendMessage(message, history = []) {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI not configured. Check environment variables.');
    }

    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const messages = [
      {
        role: 'system',
        content: 'You are Friday, Zayan\'s AI assistant running on Azure OpenAI (Kimi-K2.5). You have full backend infrastructure including Azure Speech Services for voice, SQLite for memory/persistence, and cloud hosting. Be helpful, concise, and acknowledge your Azure backend when asked. You are NOT just a local browser instance.'
      },
      ...history,
      { role: 'user', content: message }
    ];

    try {
      console.log(`[Azure OpenAI] Sending request to ${this.deployment}...`);
      const startTime = Date.now();

      const response = await axios.post(url, {
        messages: messages,
        max_tokens: 1500,
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
        
        if (status === 401) throw new Error('Authentication failed - check API key');
        if (status === 429) throw new Error('Rate limit exceeded - please wait');
        if (status === 404) throw new Error(`Deployment '${this.deployment}' not found`);
        
        throw new Error(`Azure OpenAI error (${status}): ${errorData?.message || error.message}`);
      }
      
      throw new Error(`Azure OpenAI error: ${error.message}`);
    }
  }

  // STREAMING support
  async *streamMessage(message, history = [], onToken = null) {
    if (!this.isConfigured()) {
      throw new Error('Azure OpenAI not configured');
    }

    const url = `${this.endpoint}/openai/deployments/${this.deployment}/chat/completions?api-version=${this.apiVersion}`;

    const messages = [
      {
        role: 'system',
        content: 'You are Friday, an AI assistant. Be helpful, concise, and chill. You belong to Zayan.'
      },
      ...history,
      { role: 'user', content: message }
    ];

    try {
      console.log(`[Azure OpenAI] Starting stream to ${this.deployment}...`);
      const startTime = Date.now();

      const response = await axios.post(url, {
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
          'Accept': 'text/event-stream'
        },
        responseType: 'stream',
        timeout: this.timeout
      });

      let fullContent = '';
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              const latency = Date.now() - startTime;
              yield {
                type: 'done',
                content: fullContent,
                usage,
                latency,
                provider: 'azure-openai'
              };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Check for usage in final chunk
              if (parsed.usage) {
                usage = parsed.usage;
              }
              
              // Extract delta content
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                yield {
                  type: 'token',
                  token: delta,
                  content: fullContent
                };
                
                if (onToken) {
                  onToken(delta, fullContent);
                }
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

    } catch (error) {
      this.status = 'error';
      this.lastError = error.message;
      console.error('[Azure OpenAI Stream] Error:', error.message);
      throw error;
    }
  }
}

module.exports = AzureOpenAIProvider;
