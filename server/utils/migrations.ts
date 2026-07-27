// server/utils/migrations.ts
import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Ordered, run-once schema changes.
 *
 * ensureColumn() in db.ts still covers additive column changes. Anything that
 * has to relax a NOT NULL, drop a column, or move data between tables needs a
 * table rebuild, which SQLite cannot do in place — those live here.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create user_identities',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_identities (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider     TEXT NOT NULL,
          subject      TEXT NOT NULL,
          chain_id     TEXT,
          label        TEXT,
          created_at   TEXT NOT NULL DEFAULT (datetime('now')),
          last_used_at TEXT,
          UNIQUE (provider, subject)
        );
        CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);
      `);

      // Existing Google accounts become google identities. Guarded by the
      // column still existing, because a database created after migration 2
      // no longer has users.google_id.
      const hasGoogleId = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).some(
        (c) => c.name === 'google_id'
      );
      if (hasGoogleId) {
        db.exec(`
          INSERT OR IGNORE INTO user_identities (user_id, provider, subject)
          SELECT id, 'google', google_id FROM users WHERE google_id IS NOT NULL AND google_id != ''
        `);
      }
    },
  },
  {
    version: 2,
    name: 'rebuild users without google_id and with nullable email',
    up: (db) => {
      const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
        (c) => c.name
      );
      if (!cols.includes('google_id')) return; // already rebuilt

      // foreign_keys is a connection pragma and cannot be changed inside a
      // transaction, so the caller's transaction is paused around the rebuild.
      // legacy_alter_table keeps ALTER TABLE ... RENAME from rewriting the
      // references in other tables' FK clauses.
      db.exec(`
        CREATE TABLE users_new (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          email      TEXT,
          name       TEXT NOT NULL DEFAULT '',
          avatar     TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, email, name, avatar, created_at)
          SELECT id, email, name, avatar, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
      `);
    },
  },
];

/**
 * Apply every migration the database has not seen yet, each in its own
 * transaction so a failure leaves the recorded version consistent with what
 * actually ran.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map(
      (r) => r.version
    )
  );

  const fkWasOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');

  try {
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;

      const run = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        );
      });
      run();
    }
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}
