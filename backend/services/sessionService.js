const { getDatabase } = require('../db/database');
const crypto = require('crypto');

class SessionService {
  constructor() {
    this.db = getDatabase();
  }

  generateId() {
    return crypto.randomUUID();
  }

  createSession(userId, title = 'New Conversation') {
    const id = this.generateId();
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, created_at, last_active, title, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    
    stmt.run(id, userId, now, now, title);
    console.log(`[Session] Created: ${id} for user ${userId}`);
    
    return {
      id,
      userId,
      createdAt: now,
      lastActive: now,
      title,
      messageCount: 0,
      totalTokens: 0
    };
  }

  getSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND is_active = 1
    `);
    
    const row = stmt.get(sessionId);
    if (!row) return null;
    
    return this.rowToSession(row);
  }

  getUserSessions(userId, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE user_id = ? AND is_active = 1
      ORDER BY last_active DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(userId, limit);
    return rows.map(row => this.rowToSession(row));
  }

  updateSessionActivity(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET last_active = ? 
      WHERE id = ?
    `);
    
    stmt.run(Date.now(), sessionId);
  }

  updateSessionTitle(sessionId, title) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET title = ? 
      WHERE id = ?
    `);
    
    stmt.run(title, sessionId);
  }

  updateSessionSummary(sessionId, summary) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET summary = ? 
      WHERE id = ?
    `);
    
    stmt.run(summary, sessionId);
  }

  updateTokenCounts(sessionId, promptTokens, completionTokens) {
    const totalTokens = promptTokens + completionTokens;
    
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET 
        prompt_tokens = prompt_tokens + ?,
        completion_tokens = completion_tokens + ?,
        total_tokens = total_tokens + ?,
        message_count = message_count + 1
      WHERE id = ?
    `);
    
    stmt.run(promptTokens, completionTokens, totalTokens, sessionId);
  }

  deleteSession(sessionId) {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET is_active = 0 
      WHERE id = ?
    `);
    
    stmt.run(sessionId);
    console.log(`[Session] Soft deleted: ${sessionId}`);
  }

  getSessionStats(sessionId) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as message_count,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens
      FROM messages 
      WHERE session_id = ?
    `);
    
    return stmt.get(sessionId);
  }

  rowToSession(row) {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      lastActive: row.last_active,
      title: row.title,
      summary: row.summary,
      messageCount: row.message_count,
      totalTokens: row.total_tokens,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      isActive: row.is_active === 1
    };
  }

  // Cleanup old sessions (keep last 30 days)
  cleanupOldSessions(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET is_active = 0 
      WHERE last_active < ? AND is_active = 1
    `);
    
    const result = stmt.run(cutoff);
    console.log(`[Session] Cleaned up ${result.changes} old sessions`);
    return result.changes;
  }
}

module.exports = SessionService;
