// tests/db-init-failure.test.ts
//
// useDb() used to assign the module-level dbPool *before* running initSchema.
// Because useDb short-circuits on `if (dbPool) return dbPool`, a migration that
// threw took down only the first request — every later one got that same cached
// handle back, pointing at a database sitting between the old and the new
// schema, with nothing to say a failed migration was the cause.
//
// The failure is forced rather than mocked: a legacy database that still has
// users.google_id (so migration 2 runs) but already contains a stray users_new
// table (so migration 2's CREATE TABLE users_new fails). Migration 1 commits
// first, which is what makes the resulting state genuinely half-migrated.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { useDb, closeDb, getPoolStats } from '#utils/db';
import { setRuntimeConfig } from './setup/nuxt-globals';

const tempDirs: string[] = [];

function createDbThatFailsMigration(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-failmig-'));
  tempDirs.push(dir);
  const path = join(dir, 'broken.db');

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
    INSERT INTO users (id, google_id, email, name) VALUES (1, 'google-sub-a', 'a@corp.com', 'A');

    -- The landmine. Migration 2 rebuilds users through a table of this exact
    -- name and does not use IF NOT EXISTS, so it throws here.
    CREATE TABLE users_new (id INTEGER PRIMARY KEY);
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

describe('useDb when a migration throws', () => {
  it('propagates the failure instead of returning a connection', () => {
    setRuntimeConfig({ databasePath: createDbThatFailsMigration() });

    expect(() => useDb()).toThrow(/users_new/);
  });

  it('leaves no cached handle behind, so the next call retries rather than serving a half-migrated schema', () => {
    setRuntimeConfig({ databasePath: createDbThatFailsMigration() });

    expect(() => useDb()).toThrow();

    // getPoolStats reports connectionsIdle from the module-level dbPool. If the
    // failed init had published its handle, this would be 1 and every later
    // useDb() call would hand that handle straight back.
    expect(getPoolStats().connectionsIdle).toBe(0);

    // And the second call must fail the same way rather than succeed against a
    // database that is only partly migrated.
    expect(() => useDb()).toThrow(/users_new/);
    expect(getPoolStats().connectionsIdle).toBe(0);
  });

  it('really does leave the file half-migrated — which is what must never be served', () => {
    const path = createDbThatFailsMigration();
    setRuntimeConfig({ databasePath: path });

    expect(() => useDb()).toThrow();

    // Inspected through a fresh connection, not through useDb.
    const db = new Database(path);
    try {
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
          name: string;
        }[]
      ).map((t) => t.name);
      const userCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(
        (c) => c.name
      );

      // Migration 1 committed…
      expect(tables).toContain('user_identities');
      // …and migration 2 did not: users still carries the column it was meant
      // to drop. Exactly the inconsistent shape the old code cached and served.
      expect(userCols).toContain('google_id');
    } finally {
      db.close();
    }
  });
});
