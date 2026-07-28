import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { useRuntimeConfig } from '#imports';
import { runMigrations } from './migrations';

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

  // better-sqlite3 is synchronous and single-connection; concurrency comes from
  // the WAL pragmas below rather than a connection cache. (`cache: 'shared'` is
  // not a better-sqlite3 option and was silently ignored.)
  //
  // Held in a local until the schema is known good. Assigning dbPool up front
  // published a half-migrated handle: a migration that threw left every later
  // useDb() call short-circuiting on `if (dbPool) return dbPool` and handing
  // back a database somewhere between the old and new schema, with the failure
  // visible only in the first request's 500.
  const db = new Database(path, {
    fileMustExist: false,
  });

  // Configure WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL'); // Balance durability and performance
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // 5 second timeout
  db.pragma('cache_size = -64000'); // 64MB page cache
  db.pragma('temp_store = MEMORY');

  // Enable multi-threading for better-sqlite3
  // Note: better-sqlite3 is sync-only, so we use shared cache mode
  // For true async operations, consider using better-sqlite3 with a worker pool

  // Initialize database schema
  try {
    initSchema(db);
  } catch (error) {
    // Close and stay unpublished, so the next call retries from scratch (or the
    // process dies loudly) rather than serving the half-migrated schema.
    try {
      db.close();
    } catch {
      // A close failure must not mask the migration error being rethrown.
    }
    throw error;
  }

  dbPool = db;
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
      email      TEXT,
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
      kind       TEXT NOT NULL,
      identifier TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, kind, identifier)
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
    -- NFT-based project ownership
    CREATE TABLE IF NOT EXISTS nft_project_ownership (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      nft_contract    TEXT NOT NULL,
      nft_token_id    TEXT NOT NULL,
      network         TEXT NOT NULL DEFAULT 'ethereum',
      owner_address   TEXT NOT NULL,
      granted_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, nft_contract)
    );
  `);

  // Columns added after the initial release. CREATE TABLE IF NOT EXISTS does
  // not touch tables that already exist, so these are applied separately for
  // databases created before the theming, wallet, and encryption features
  // landed. Definitions must stay in sync with the CREATE TABLE above.
  ensureColumn(
    db,
    'projects',
    'font_family',
    `TEXT NOT NULL DEFAULT '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'`
  );
  ensureColumn(db, 'projects', 'bg_color', "TEXT NOT NULL DEFAULT '#ffffff'");
  ensureColumn(db, 'projects', 'bg_subtle', "TEXT NOT NULL DEFAULT '#f7f8fa'");
  ensureColumn(db, 'projects', 'text_color', "TEXT NOT NULL DEFAULT '#1f2430'");
  ensureColumn(db, 'projects', 'text-muted', "TEXT NOT NULL DEFAULT '#6b7280'");
  ensureColumn(db, 'projects', 'border_color', "TEXT NOT NULL DEFAULT '#e5e8ec'");
  ensureColumn(db, 'projects', 'radius', 'INTEGER NOT NULL DEFAULT 8');
  ensureColumn(db, 'pages', 'encrypted_content', 'TEXT');
  ensureColumn(db, 'pages', 'encryption_iv', 'TEXT');
  ensureColumn(db, 'pages', 'encryption_key_id', 'TEXT');
  ensureColumn(db, 'pages', 'content_hash', 'TEXT');
  ensureColumn(db, 'pages', 'is_encrypted', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages (project_id, slug);
    CREATE INDEX IF NOT EXISTS idx_pages_encrypted ON pages (project_id, is_encrypted);
    CREATE INDEX IF NOT EXISTS idx_sections_order ON sections (project_id, position);
    CREATE INDEX IF NOT EXISTS idx_encryption_keys_project ON encryption_keys (project_id);
    CREATE INDEX IF NOT EXISTS idx_encryption_keys_updated ON encryption_keys (updated_at);
    CREATE INDEX IF NOT EXISTS idx_user_encryption_access_user ON user_encryption_access (user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_token_gated_project ON token_gated_projects (project_id, token_contract);
    CREATE INDEX IF NOT EXISTS idx_nft_ownership_owner ON nft_project_ownership (owner_address);
    CREATE INDEX IF NOT EXISTS idx_nft_ownership_project ON nft_project_ownership (project_id);
  `);

  // Rebuilds and data moves that ensureColumn cannot express.
  runMigrations(db);
}

/**
 * Add a column to an existing table if it is not already present.
 *
 * SQLite has no ADD COLUMN IF NOT EXISTS, so the current columns are read from
 * table_info first. The column name and definition are code-supplied constants,
 * never user input.
 */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];

  if (!columns.some((c) => c.name === column)) {
    // Quoted so names with hyphens ("text-muted") work; PRAGMA table_info
    // reports names unquoted, so the existence check above stays bare.
    db.exec(`ALTER TABLE ${table} ADD COLUMN "${column}" ${definition}`);
  }
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
  // Arguments passed here are forwarded to fn — calling transaction() with no
  // arguments invoked fn(undefined).
  return transaction(db);
}
