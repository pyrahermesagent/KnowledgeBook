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
}
