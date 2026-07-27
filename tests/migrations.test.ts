// tests/migrations.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { useDb, closeDb } from '#utils/db';
import { setRuntimeConfig } from './setup/nuxt-globals';

const tempDirs: string[] = [];

/**
 * A database as it exists BEFORE this feature: Google users, wallet users, and
 * the two parallel membership tables. Migrations must fold this into the
 * unified model without losing or granting access.
 */
function createPreMigrationDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-premig-'));
  tempDirs.push(dir);
  const path = join(dir, 'pre.db');
  const db = new Database(path);

  db.exec(`
    CREATE TABLE users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id  TEXT NOT NULL UNIQUE,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE projects (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug                 TEXT NOT NULL UNIQUE,
      name                 TEXT NOT NULL,
      description          TEXT NOT NULL DEFAULT '',
      owner_wallet_address TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE project_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email      TEXT NOT NULL,
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, email)
    );
    CREATE TABLE wallet_users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      chain_id       INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE wallet_project_members (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      added_at       TEXT NOT NULL DEFAULT (datetime('now')),
      role           TEXT NOT NULL DEFAULT 'member',
      UNIQUE (project_id, wallet_address)
    );

    -- Ids are deliberately non-sequential (1, 5): a rebuild that forgot to
    -- copy id explicitly and instead let AUTOINCREMENT renumber rows in scan
    -- order would produce (1, 2) here, which would coincidentally still pass
    -- an assertion pinned to id 1 alone. Bob at id 5 catches that bug.
    INSERT INTO users (id, google_id, email, name) VALUES
      (1, 'google-sub-alice', 'alice@corp.com', 'Alice'),
      (5, 'google-sub-bob',   'bob@corp.com',   'Bob');
    INSERT INTO wallet_users (id, wallet_address, chain_id) VALUES
      (1, '0x1111111111111111111111111111111111111111', 1);
    INSERT INTO projects (id, owner_id, slug, name) VALUES
      (10, 1, 'alice-docs', 'Alice Docs'),
      (11, 5, 'bob-docs',   'Bob Docs');
    INSERT INTO project_members (project_id, email) VALUES (10, 'bob@corp.com');
    INSERT INTO wallet_project_members (project_id, wallet_address) VALUES
      (10, '0x1111111111111111111111111111111111111111');
  `);
  db.close();
  return path;
}

afterEach(() => {
  closeDb();
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may hold the file briefly after close.
    }
  }
});

describe('user_identities migration', () => {
  it('creates the table and backfills a google identity per existing user', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const rows = db
      .prepare(
        "SELECT user_id, subject FROM user_identities WHERE provider = 'google' ORDER BY user_id"
      )
      .all() as { user_id: number; subject: string }[];

    expect(rows).toEqual([
      { user_id: 1, subject: 'google-sub-alice' },
      { user_id: 5, subject: 'google-sub-bob' },
    ]);
  });

  it('refuses to link one wallet to two accounts', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    db.prepare(
      "INSERT INTO user_identities (user_id, provider, subject) VALUES (1, 'eip155', '0xaaa')"
    ).run();

    expect(() =>
      db
        .prepare(
          "INSERT INTO user_identities (user_id, provider, subject) VALUES (5, 'eip155', '0xaaa')"
        )
        .run()
    ).toThrow(/UNIQUE/i);
  });

  it('is idempotent across repeated boots', () => {
    const path = createPreMigrationDb();
    setRuntimeConfig({ databasePath: path });
    useDb();
    closeDb();
    setRuntimeConfig({ databasePath: path });
    const db = useDb();

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM user_identities WHERE provider = 'google'")
      .get() as { n: number };
    expect(count.n).toBe(2);
  });
});

describe('users table rebuild', () => {
  it('drops google_id and makes email nullable while preserving ids', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const cols = db.prepare('PRAGMA table_info(users)').all() as {
      name: string;
      notnull: number;
    }[];
    expect(cols.map((c) => c.name)).not.toContain('google_id');
    expect(cols.find((c) => c.name === 'email')!.notnull).toBe(0);

    // Ids must survive: projects.owner_id points at them. The fixture seeds
    // non-sequential ids (1, 5) specifically so a rebuild that renumbers via
    // AUTOINCREMENT instead of copying id explicitly cannot pass this by
    // coincidentally landing user 1 on row 1 while silently shifting user 5.
    const alice = db.prepare('SELECT id, email FROM users WHERE id = 1').get() as {
      id: number;
      email: string;
    };
    expect(alice.email).toBe('alice@corp.com');

    const bob = db.prepare('SELECT id, email FROM users WHERE id = 5').get() as
      { id: number; email: string } | undefined;
    expect(bob?.email).toBe('bob@corp.com');

    const aliceProject = db.prepare('SELECT owner_id FROM projects WHERE id = 10').get() as {
      owner_id: number;
    };
    expect(aliceProject.owner_id).toBe(1);

    // Bob's project must still resolve to Bob by identity, not just by
    // whatever numeric id happens to occupy that slot after the rebuild.
    const bobProject = db.prepare('SELECT owner_id FROM projects WHERE id = 11').get() as {
      owner_id: number;
    };
    expect(bobProject.owner_id).toBe(5);

    const bobOwner = db.prepare('SELECT email FROM users WHERE id = ?').get(bobProject.owner_id) as
      { email: string } | undefined;
    expect(bobOwner?.email).toBe('bob@corp.com');
  });

  it('allows an emailless user once rebuilt', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    expect(() =>
      db.prepare("INSERT INTO users (name, avatar) VALUES ('Wallet person', '')").run()
    ).not.toThrow();
  });
});
