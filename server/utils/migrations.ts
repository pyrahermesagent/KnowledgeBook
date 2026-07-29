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

      // Other tables carry REFERENCES users(id) clauses. SQLite rewrites those
      // to follow an ALTER TABLE ... RENAME only while foreign_keys is ON, so
      // what keeps this rebuild safe is runMigrations turning foreign_keys OFF
      // for the whole run — it is a connection pragma and cannot be toggled
      // inside a transaction, hence the toggle living out there rather than
      // here. (legacy_alter_table is never set; an earlier version of this
      // comment credited it.)
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
  {
    version: 3,
    name: 'fold wallet_users into users and user_identities',
    up: (db) => {
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string;
        }[]
      ).map((t) => t.name);
      if (!tables.includes('wallet_users')) return;

      const wallets = db
        .prepare('SELECT wallet_address, chain_id, created_at FROM wallet_users')
        .all() as { wallet_address: string; chain_id: number; created_at: string }[];

      const insertUser = db.prepare(
        'INSERT INTO users (email, name, avatar, created_at) VALUES (NULL, ?, ?, ?) RETURNING id'
      );
      const insertIdentity = db.prepare(
        `INSERT OR IGNORE INTO user_identities (user_id, provider, subject, chain_id, created_at)
         VALUES (?, 'eip155', ?, ?, ?)`
      );

      for (const w of wallets) {
        const address = w.wallet_address.toLowerCase();
        const existing = db
          .prepare("SELECT user_id FROM user_identities WHERE provider = 'eip155' AND subject = ?")
          .get(address) as { user_id: number } | undefined;
        if (existing) continue;

        const shortened = `${address.slice(0, 6)}…${address.slice(-4)}`;
        const { id } = insertUser.get(shortened, '', w.created_at) as { id: number };
        insertIdentity.run(id, address, `eip155:${w.chain_id}`, w.created_at);
      }

      // Wallet-owned projects now point at the real account that owns them.
      const projectCols = (
        db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
      ).map((c) => c.name);
      if (projectCols.includes('owner_wallet_address')) {
        db.exec(`
          UPDATE projects
          SET owner_id = (
            SELECT i.user_id FROM user_identities i
            WHERE i.provider = 'eip155' AND i.subject = lower(projects.owner_wallet_address)
          )
          WHERE owner_wallet_address IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM user_identities i
              WHERE i.provider = 'eip155' AND i.subject = lower(projects.owner_wallet_address)
            )
        `);
      }
    },
  },
  {
    version: 4,
    name: 'rekey project_members and drop superseded tables',
    up: (db) => {
      const memberCols = (
        db.prepare('PRAGMA table_info(project_members)').all() as { name: string }[]
      ).map((c) => c.name);

      if (memberCols.includes('email')) {
        db.exec(`
          CREATE TABLE project_members_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kind       TEXT NOT NULL,
            identifier TEXT NOT NULL,
            role       TEXT NOT NULL DEFAULT 'member',
            added_at   TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (project_id, kind, identifier)
          );
          -- lower(email): the app stores and matches email members through
          -- normalizeEmail(), so a manually seeded mixed-case legacy row would
          -- otherwise never match its owner again. OR IGNORE because the legacy
          -- UNIQUE (project_id, email) was case-sensitive: 'Bob@x' and 'bob@x'
          -- could coexist there and collapse to one row here.
          INSERT OR IGNORE INTO project_members_new (id, project_id, kind, identifier, role, added_at)
            SELECT id, project_id, 'email', lower(email), 'member', added_at FROM project_members;
          DROP TABLE project_members;
          ALTER TABLE project_members_new RENAME TO project_members;
        `);
      }

      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string;
        }[]
      ).map((t) => t.name);

      if (tables.includes('wallet_project_members')) {
        db.exec(`
          INSERT OR IGNORE INTO project_members (project_id, kind, identifier, role, added_at)
            SELECT project_id, 'eip155', lower(wallet_address), role, added_at
            FROM wallet_project_members;
          DROP TABLE wallet_project_members;
        `);
      }
      if (tables.includes('wallet_users')) {
        db.exec('DROP TABLE wallet_users');
      }

      const projectCols = (
        db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
      ).map((c) => c.name);
      if (projectCols.includes('owner_wallet_address')) {
        db.exec('ALTER TABLE projects DROP COLUMN owner_wallet_address');
      }

      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_project_members_lookup ON project_members (project_id, kind, identifier)'
      );
    },
  },
  {
    version: 5,
    name: 'lowercase email member identifiers',
    up: (db) => {
      // Migration 4 originally copied `email` verbatim. It has already run on
      // every live database, so fixing its body only helps databases that have
      // not migrated yet — this step repairs the ones that have. It is written
      // to be a no-op when there is nothing left to lowercase, so running it on
      // a database migrated by the fixed version 4 changes nothing.
      //
      // Collisions first: UNIQUE (project_id, kind, identifier) would reject the
      // UPDATE if a project already held the lowercase twin of a mixed-case row.
      // Both rows mean the same person, so the mixed-case one is the one to drop.
      db.exec(`
        DELETE FROM project_members
        WHERE kind = 'email'
          AND identifier <> lower(identifier)
          AND EXISTS (
            SELECT 1 FROM project_members other
            WHERE other.project_id = project_members.project_id
              AND other.kind = 'email'
              AND other.identifier = lower(project_members.identifier)
          );
        UPDATE project_members
        SET identifier = lower(identifier)
        WHERE kind = 'email' AND identifier <> lower(identifier);
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
