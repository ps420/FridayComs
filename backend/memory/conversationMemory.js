const MessageService = require('../services/messageService');

class ConversationMemory {
  constructor() {
    this.messageService = new MessageService();
    this.summaries = new Map(); // In-memory cache of summaries
  }

  // Build context for AI from recent messages
  async buildContext(sessionId, maxMessages = 20, maxTokens = 4000) {
    const messages = this.messageService.getContextMessages(sessionId, maxMessages);
    
    if (messages.length === 0) {
      return [{
        role: 'system',
        content: 'You are Friday, an AI assistant. Be helpful, concise, and chill. You belong to Zayan. This is a new conversation.'
      }];
    }

    // Check if we need to summarize
    const tokenCount = messages.reduce((sum, m) => sum + (m.totalTokens || 0), 0);
    
    let context = [{
      role: 'system',
      content: 'You are Friday, an AI assistant. Be helpful, concise, and chill. You belong to Zayan.'
    }];

    // If conversation is long, add summary
    if (tokenCount > maxTokens && messages.length > 10) {
      const summary = await this.getOrCreateSummary(sessionId);
      if (summary) {
        context[0].content += `\n\nPrevious conversation summary: ${summary}`;
        // Only include last 5 messages after summary
        context.push(...this.formatMessages(messages.slice(-5)));
        return context;
      }
    }

    // Include all recent messages
    context.push(...this.formatMessages(messages));
    return context;
  }

  formatMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  // Create or retrieve conversation summary
  async getOrCreateSummary(sessionId) {
    // Check cache first
    if (this.summaries.has(sessionId)) {
      return this.summaries.get(sessionId);
    }

    // Get all messages
    const messages = this.messageService.getMessages(sessionId, 100);
    
    if (messages.length < 10) {
      return null; // Too short to summarize
    }

    // Create summary from first half of messages
    const oldMessages = messages.slice(0, Math.floor(messages.length / 2));
    const summary = this.createSummary(oldMessages);
    
    this.summaries.set(sessionId, summary);
    return summary;
  }

  createSummary(messages) {
    // Simple extraction-based summarization
    // In production, this would call an LLM
    const topics = new Set();
    let summary = '';
    
    messages.forEach(m => {
      if (m.role === 'user') {
        // Extract key topics (simple keyword extraction)
        const words = m.content.toLowerCase().split(/\s+/);
        words.forEach(word => {
          if (word.length > 5 && !['about', 'would', 'should', 'could'].includes(word)) {
            topics.add(word);
          }
        });
      }
    });

    const topicList = Array.from(topics).slice(0, 10).join(', ');
    summary = `Conversation about: ${topicList}. ${messages.length} messages exchanged.`;
    
    return summary;
  }

  // Get conversation stats
  getConversationStats(sessionId) {
    const messageCount = this.messageService.getMessageCount(sessionId);
    const tokenUsage = this.messageService.getTokenUsage(sessionId);
    
    return {
      messageCount,
      ...tokenUsage
    };
  }

  // Check if conversation needs compression
  needsCompression(sessionId, threshold = 8000) {
    const usage = this.messageService.getTokenUsage(sessionId);
    return (usage.total_tokens || 0) > threshold;
  }

  // Clear memory cache for a session
  clearCache(sessionId) {
    this.summaries.delete(sessionId);
  }
}

module.exports = ConversationMemory;
