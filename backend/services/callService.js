const { getDatabase } = require('../db/database');
const crypto = require('crypto');

class CallService {
  constructor() {
    this.db = getDatabase();
    this.activeCalls = new Map(); // In-memory active calls
  }

  // Create calls table if not exists
  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        direction TEXT NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        duration INTEGER DEFAULT 0,
        call_type TEXT DEFAULT 'voice',
        audio_url TEXT,
        transcript TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_session ON calls(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status)`);
    
    console.log('[CallService] Initialized');
  }

  generateCallId() {
    return 'call_' + crypto.randomUUID().slice(0, 8);
  }

  initiateCall(sessionId, userId, callType = 'voice') {
    const callId = this.generateCallId();
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO calls (id, session_id, user_id, status, direction, call_type, created_at)
      VALUES (?, ?, ?, 'initiated', 'outbound', ?, ?)
    `);
    
    stmt.run(callId, sessionId, userId, callType, now);
    
    const call = {
      id: callId,
      sessionId,
      userId,
      status: 'initiated',
      direction: 'outbound',
      callType,
      createdAt: now
    };
    
    this.activeCalls.set(callId, call);
    console.log(`[Call] Initiated: ${callId}`);
    
    return call;
  }

  startCall(callId) {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE calls 
      SET status = 'active', started_at = ?
      WHERE id = ?
    `);
    
    stmt.run(now, callId);
    
    const call = this.activeCalls.get(callId);
    if (call) {
      call.status = 'active';
      call.startedAt = now;
      console.log(`[Call] Started: ${callId}`);
    }
    
    return this.getCall(callId);
  }

  endCall(callId, metadata = {}) {
    const now = Date.now();
    const call = this.getCall(callId);
    
    if (!call) return null;
    
    const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0;
    
    const stmt = this.db.prepare(`
      UPDATE calls 
      SET status = 'ended', 
          ended_at = ?,
          duration = ?,
          transcript = ?,
          metadata = ?
      WHERE id = ?
    `);
    
    stmt.run(
      now,
      duration,
      metadata.transcript || null,
      JSON.stringify(metadata),
      callId
    );
    
    this.activeCalls.delete(callId);
    console.log(`[Call] Ended: ${callId}, Duration: ${duration}s`);
    
    return { ...call, status: 'ended', endedAt: now, duration };
  }

  getCall(callId) {
    const stmt = this.db.prepare(`SELECT * FROM calls WHERE id = ?`);
    const row = stmt.get(callId);
    return row ? this.rowToCall(row) : this.activeCalls.get(callId);
  }

  getSessionCalls(sessionId, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT * FROM calls 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(sessionId, limit);
    return rows.map(row => this.rowToCall(row));
  }

  getCallHistory(userId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT c.*, s.title as session_title
      FROM calls c
      JOIN sessions s ON c.session_id = s.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(userId, limit);
    return rows.map(row => this.rowToCall(row));
  }

  getActiveCallForSession(sessionId) {
    for (const [id, call] of this.activeCalls) {
      if (call.sessionId === sessionId && call.status === 'active') {
        return call;
      }
    }
    return null;
  }

  updateCallStatus(callId, status, metadata = {}) {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.status = status;
      Object.assign(call, metadata);
    }
    return call;
  }

  rowToCall(row) {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      status: row.status,
      direction: row.direction,
      callType: row.call_type,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      duration: row.duration,
      audioUrl: row.audio_url,
      transcript: row.transcript,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: row.created_at
    };
  }

  // Update call with voice processing results
  updateCallResult(callId, { transcript, aiResponse, audioUrl, duration, metadata = {} }) {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE calls 
      SET transcript = ?,
          metadata = ?,
          duration = ?,
          audio_url = ?,
          ended_at = ?
      WHERE id = ?
    `);
    
    const meta = JSON.stringify({
      ...metadata,
      aiResponse,
      processedAt: now
    });
    
    stmt.run(transcript, meta, duration, audioUrl, now, callId);
    
    const call = this.rowToCall({
      id: callId,
      transcript,
      metadata: meta,
      duration,
      audio_url: audioUrl,
      ended_at: now
    });
    
    console.log(`[Call] Updated with result: ${callId}, transcript: ${transcript?.slice(0, 50)}...`);
    
    return call;
  }
}

// Auto-init on first use
let instance = null;
module.exports = {
  getCallService: () => {
    if (!instance) {
      instance = new CallService();
      instance.init();
    }
    return instance;
  }
};
