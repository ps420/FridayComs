const AzureOpenAIProvider = require('../../providers/azure-openai');
const MockProvider = require('../../providers/mock-provider');
const MessageService = require('./messageService');
const SessionService = require('./sessionService');

class StreamingService {
  constructor() {
    this.azureProvider = new AzureOpenAIProvider();
    this.mockProvider = new MockProvider();
    this.messageService = new MessageService();
    this.sessionService = new SessionService();
    this.activeStreams = new Map(); // Track active streams by session
  }

  async streamResponse(sessionId, message, history, ws) {
    const provider = this.azureProvider.isConfigured() ? this.azureProvider : this.mockProvider;
    const startTime = Date.now();
    
    // Save user message
    this.messageService.addMessage(sessionId, 'user', message);
    this.sessionService.updateSessionActivity(sessionId);

    // Send streaming started message
    ws.send(JSON.stringify({
      type: 'stream_start',
      sessionId,
      timestamp: Date.now()
    }));

    try {
      if (provider === this.azureProvider) {
        // Real streaming from Azure
        let fullContent = '';
        let tokenCount = 0;

        for await (const chunk of provider.streamMessage(message, history)) {
          if (chunk.type === 'token') {
            fullContent = chunk.content;
            tokenCount++;

            // Send token to client (throttle for performance)
            if (tokenCount % 3 === 0 || chunk.token.match(/[.!?]$/)) {
              ws.send(JSON.stringify({
                type: 'stream_token',
                token: chunk.token,
                content: fullContent,
                sessionId
              }));
            }
          }

          if (chunk.type === 'done') {
            // Save final message
            const messageData = this.messageService.addMessage(
              sessionId,
              'assistant',
              fullContent,
              {
                provider: 'azure-openai',
                latency: chunk.latency,
                promptTokens: chunk.usage?.prompt_tokens || 0,
                completionTokens: chunk.usage?.completion_tokens || 0,
                totalTokens: chunk.usage?.total_tokens || 0,
                isStreaming: false
              }
            );

            // Update session token counts
            this.sessionService.updateTokenCounts(
              sessionId,
              chunk.usage?.prompt_tokens || 0,
              chunk.usage?.completion_tokens || 0
            );

            // Send completion
            ws.send(JSON.stringify({
              type: 'stream_end',
              messageId: messageData.id,
              content: fullContent,
              latency: chunk.latency,
              usage: chunk.usage,
              sessionId
            }));

            console.log(`[Stream] Completed: ${tokenCount} tokens in ${chunk.latency}ms`);
          }
        }
      } else {
        // Mock streaming (simulate tokens)
        await this.streamMockResponse(sessionId, message, ws);
      }

    } catch (error) {
      console.error('[Stream] Error:', error.message);
      
      // Send error to client
      ws.send(JSON.stringify({
        type: 'stream_error',
        error: error.message,
        sessionId
      }));

      // Fallback to non-streaming mock
      const mockResponse = await this.mockProvider.sendMessage(message, history);
      
      const messageData = this.messageService.addMessage(
        sessionId,
        'assistant',
        `[Stream Error - Fallback] ${mockResponse.content}`,
        { provider: 'mock', latency: 100 }
      );

      ws.send(JSON.stringify({
        type: 'message',
        data: {
          id: messageData.id,
          type: 'ai',
          isMock: true,
          isError: true,
          content: messageData.content,
          timestamp: Date.now()
        }
      }));
    }
  }

  async streamMockResponse(sessionId, message, ws) {
    const response = await this.mockProvider.sendMessage(message);
    const content = response.content;
    const words = content.split(' ');
    
    let fullContent = '';
    
    // Simulate streaming by sending words gradually
    for (let i = 0; i < words.length; i++) {
      fullContent += (i > 0 ? ' ' : '') + words[i];
      
      ws.send(JSON.stringify({
        type: 'stream_token',
        token: words[i] + ' ',
        content: fullContent,
        sessionId
      }));

      // Small delay to simulate typing
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Save final message
    const messageData = this.messageService.addMessage(
      sessionId,
      'assistant',
      fullContent,
      { provider: 'mock', latency: response.latency, isStreaming: false }
    );

    ws.send(JSON.stringify({
      type: 'stream_end',
      messageId: messageData.id,
      content: fullContent,
      latency: response.latency,
      usage: response.usage,
      sessionId
    }));
  }

  cancelStream(sessionId) {
    // Mark stream as cancelled
    this.activeStreams.delete(sessionId);
    console.log(`[Stream] Cancelled: ${sessionId}`);
  }
}

module.exports = StreamingService;
