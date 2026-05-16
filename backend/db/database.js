const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fridaycoms.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!require('fs').existsSync(dataDir)) {
  require('fs').mkdirSync(dataDir, { recursive: true });
}

class DatabaseManager {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    try {
      this.db = new Database(DB_PATH);
      console.log('[DB] Connected to SQLite');
      this.createTables();
    } catch (err) {
      console.error('[DB] Failed to connect:', err.message);
      throw err;
    }
  }

  createTables() {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active INTEGER NOT NULL,
        title TEXT,
        summary TEXT,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        provider TEXT,
        latency INTEGER,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        is_streaming INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Token usage tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        date TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active)`);

    console.log('[DB] Tables initialized');
  }

  getDb() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('[DB] Connection closed');
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getDatabase: () => {
    if (!instance) {
      instance = new DatabaseManager();
    }
    return instance.getDb();
  },
  closeDatabase: () => {
    if (instance) {
      instance.close();
      instance = null;
    }
  }
};
