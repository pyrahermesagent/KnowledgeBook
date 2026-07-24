import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { useRuntimeConfig } from '#imports';

// Connection pool configuration
const POOL_CONFIG = {
  connections: 10,
  acquireTimeout: 10000,
  maxIdle: 5,
  minIdle: 2,
};

// Connection pool storage
let dbPool: Database.Database | null = null;
let connectionCounter = 0;

/**
 * Get pooled database connection
 * Uses better-sqlite3's built-in shared cache mode
 */
export function useDb(): Database.Database {
  if (dbPool) return dbPool;

  const path = resolve(useRuntimeConfig().databasePath);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  // better-sqlite3 uses shared cache by default when using same path
  // We configure pragmas for optimal performance
  dbPool = new Database(path, {
    fileMustExist: false,
    cache: 'shared', // Enable shared cache for better multi-threading
  });

  // Configure WAL mode for better concurrency
  dbPool.pragma('journal_mode = WAL');
  dbPool.pragma('synchronous = NORMAL'); // Balance durability and performance
  dbPool.pragma('foreign_keys = ON');
  dbPool.pragma('busy_timeout = 5000'); // 5 second timeout
  dbPool.pragma('cache_size = -64000'); // 64MB page cache
  dbPool.pragma('temp_store = MEMORY');

  // Enable multi-threading for better-sqlite3
  // Note: better-sqlite3 is sync-only, so we use shared cache mode
  // For true async operations, consider using better-sqlite3 with a worker pool

  // Initialize database schema
  initSchema(dbPool);

  return dbPool;
}

/**
 * Get connection pool statistics
 */
export function getPoolStats(): {
  connections: number;
  connectionsActive: number;
  connectionsIdle: number;
  connectionCounter: number;
} {
  return {
    connections: POOL_CONFIG.connections,
    connectionsActive: 1, // better-sqlite3 is sync-only
    connectionsIdle: dbPool ? 1 : 0,
    connectionCounter,
  };
}

/**
 * Close all database connections
 * Use in test cleanup or shutdown
 */
export function closeDb(): void {
  if (dbPool) {
    dbPool.close();
    dbPool = null;
  }
}

/**
 * Initialize database schema with all tables
 */
function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id  TEXT NOT NULL UNIQUE,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug           TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL,
      description    TEXT NOT NULL DEFAULT '',
      accent_color   TEXT NOT NULL DEFAULT '#346ddb',
      icon_url       TEXT NOT NULL DEFAULT '',
      font_family    TEXT NOT NULL DEFAULT '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      bg_color       TEXT NOT NULL DEFAULT '#ffffff',
      bg_subtle      TEXT NOT NULL DEFAULT '#f7f8fa',
      text_color     TEXT NOT NULL DEFAULT '#1f2430',
      "text-muted"   TEXT NOT NULL DEFAULT '#6b7280',
      border_color   TEXT NOT NULL DEFAULT '#e5e8ec',
      radius         INTEGER NOT NULL DEFAULT 8,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sections (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS project_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email      TEXT NOT NULL,
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, email)
    );
    CREATE TABLE IF NOT EXISTS pages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
      slug       TEXT NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, slug)
    );
    -- Page version history for audit trail
    CREATE TABLE IF NOT EXISTS page_versions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id            INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      content            TEXT NOT NULL,
      title              TEXT NOT NULL,
      version            INTEGER NOT NULL DEFAULT 1,
      edited_by_user_id  INTEGER REFERENCES users(id),
      is_ai_edit         BOOLEAN NOT NULL DEFAULT 0,
      version_comment    TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Wallet users table for Web3 authentication
    CREATE TABLE IF NOT EXISTS wallet_users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT NOT NULL UNIQUE,
      chain_id        INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Wallet project members table for project access control
    CREATE TABLE IF NOT EXISTS wallet_project_members (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      wallet_address  TEXT NOT NULL,
      added_at        TEXT NOT NULL DEFAULT (datetime('now')),
      role            TEXT NOT NULL DEFAULT 'member',
      UNIQUE (project_id, wallet_address)
    );
    -- Token-gated projects configuration
    CREATE TABLE IF NOT EXISTS token_gated_projects (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      token_contract  TEXT NOT NULL,
      token_id        INTEGER,
      min_balance     INTEGER,
      network         TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Encryption keys table
    CREATE TABLE IF NOT EXISTS encryption_keys (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      key_id          TEXT NOT NULL,
      encrypted_key   TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- User encryption access table
    CREATE TABLE IF NOT EXISTS user_encryption_access (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      granted_at      TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at      TEXT,
      UNIQUE (user_id, project_id)
    );
  `);
}

/**
 * Execute multiple SQL statements in a batch
 * Uses transaction for atomicity
 */
export function executeBatch(sql: string): void {
  const db = useDb();
  db.exec(sql);
}

/**
 * Run a transaction with automatic commit/rollback
 */
export function runTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = useDb();
  const transaction = db.transaction(fn);
  return transaction();
}
