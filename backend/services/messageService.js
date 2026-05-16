const { getDatabase } = require('../db/database');

class MessageService {
  constructor() {
    this.db = getDatabase();
  }

  addMessage(sessionId, role, content, metadata = {}) {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO messages 
      (session_id, role, content, created_at, provider, latency, prompt_tokens, completion_tokens, total_tokens, is_streaming)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      sessionId,
      role,
      content,
      now,
      metadata.provider || null,
      metadata.latency || null,
      metadata.promptTokens || 0,
      metadata.completionTokens || 0,
      metadata.totalTokens || 0,
      metadata.isStreaming ? 1 : 0
    );
    
    return {
      id: result.lastInsertRowid,
      sessionId,
      role,
      content,
      createdAt: now,
      ...metadata
    };
  }

  getMessages(sessionId, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(sessionId, limit, offset);
    return rows.map(row => this.rowToMessage(row)).reverse();
  }

  getRecentMessages(sessionId, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(sessionId, limit);
    return rows.map(row => this.rowToMessage(row)).reverse();
  }

  getMessageCount(sessionId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE session_id = ?
    `);
    
    return stmt.get(sessionId).count;
  }

  // Get messages for context (last N messages, excluding streaming intermediates)
  getContextMessages(sessionId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE session_id = ? AND is_streaming = 0
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(sessionId, limit);
    return rows.map(row => this.rowToMessage(row)).reverse();
  }

  // Update streaming message with final content
  finalizeStreamingMessage(messageId, content, metadata = {}) {
    const stmt = this.db.prepare(`
      UPDATE messages 
      SET 
        content = ?,
        is_streaming = 0,
        provider = ?,
        latency = ?,
        prompt_tokens = ?,
        completion_tokens = ?,
        total_tokens = ?
      WHERE id = ?
    `);
    
    stmt.run(
      content,
      metadata.provider || null,
      metadata.latency || null,
      metadata.promptTokens || 0,
      metadata.completionTokens || 0,
      metadata.totalTokens || 0,
      messageId
    );
  }

  // Clear all messages in a session
  clearSessionMessages(sessionId) {
    const stmt = this.db.prepare(`
      DELETE FROM messages WHERE session_id = ?
    `);
    
    stmt.run(sessionId);
  }

  // Get token usage for a session
  getTokenUsage(sessionId) {
    const stmt = this.db.prepare(`
      SELECT 
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        COUNT(*) as message_count
      FROM messages 
      WHERE session_id = ? AND role = 'assistant'
    `);
    
    return stmt.get(sessionId);
  }

  // Get daily token usage
  getDailyTokenUsage(sessionId, days = 7) {
    const stmt = this.db.prepare(`
      SELECT 
        date(created_at / 1000, 'unixepoch') as date,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        COUNT(*) as request_count
      FROM messages 
      WHERE session_id = ? 
        AND created_at > ?
      GROUP BY date
      ORDER BY date DESC
    `);
    
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return stmt.all(sessionId, cutoff);
  }

  rowToMessage(row) {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      provider: row.provider,
      latency: row.latency,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      isStreaming: row.is_streaming === 1
    };
  }
}

module.exports = MessageService;
