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
 * Mixed-case (checksum-style) address used alongside the all-digit
 * `0x1111...1111` wallet already in the fixture. `0x1111...1111` has no hex
 * letters, so lowercasing it is a no-op — a dropped `.toLowerCase()`/`lower()`
 * anywhere in the fold would still pass every assertion keyed on that address.
 * This one has letters, so canonicalization actually has something to do.
 *
 * The "lower" constant is a separate hardcoded literal, not
 * `MIXED_CASE_WALLET.toLowerCase()` computed here — an assertion built from a
 * value computed the same way the code under test computes it would still
 * pass if that computation were subtly wrong or removed.
 */
const MIXED_CASE_WALLET = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
const MIXED_CASE_WALLET_LOWER = '0xabcdef0123456789abcdef0123456789abcdef01';

/** No wallet_users row (and so no identity) exists for this address. */
const ORPHAN_WALLET = '0x9999999999999999999999999999999999999999';

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
    -- Wallet 2 is the mixed-case address (see MIXED_CASE_WALLET above), added
    -- so the fold has a wallet whose lowercasing actually matters.
    INSERT INTO wallet_users (id, wallet_address, chain_id) VALUES
      (1, '0x1111111111111111111111111111111111111111', 1),
      (2, '${MIXED_CASE_WALLET}', 1);
    INSERT INTO projects (id, owner_id, slug, name) VALUES
      (10, 1, 'alice-docs', 'Alice Docs'),
      (11, 5, 'bob-docs',   'Bob Docs');
    -- Project 12 is wallet-owned (owner_wallet_address set, mixed case) so
    -- migration 3's ownership-resolution UPDATE has a row to actually
    -- resolve; its seeded owner_id (1) is a placeholder that must be moved to
    -- the real wallet owner. Project 13's owner_wallet_address matches no
    -- wallet_users row / identity, so the EXISTS guard must leave its seeded
    -- owner_id (5) untouched rather than nulling it (owner_id is NOT NULL).
    INSERT INTO projects (id, owner_id, slug, name, owner_wallet_address) VALUES
      (12, 1, 'wallet-owned-docs',  'Wallet Owned Docs',  '${MIXED_CASE_WALLET}'),
      (13, 5, 'orphan-wallet-docs', 'Orphan Wallet Docs', '${ORPHAN_WALLET}');
    -- Project 10 also gets a mixed-case email member. The app normalizes every
    -- email through normalizeEmail() before storing or matching it, but a
    -- manually seeded legacy row could be any casing, and migration 4 used to
    -- copy the email column verbatim — silently locking that person out.
    INSERT INTO project_members (project_id, email) VALUES
      (10, 'bob@corp.com'),
      (10, 'Carol.Danvers@Corp.com');
    -- Project 11 gets the mixed-case wallet as a member too, so migration 4's
    -- fold (not just migration 3's identity creation) has a mixed-case row to
    -- lowercase.
    INSERT INTO wallet_project_members (project_id, wallet_address) VALUES
      (10, '0x1111111111111111111111111111111111111111'),
      (11, '${MIXED_CASE_WALLET}');
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

describe('wallet fold-in', () => {
  it('gives each wallet_users row an account and an eip155 identity', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const identity = db
      .prepare(
        "SELECT user_id, chain_id FROM user_identities WHERE provider = 'eip155' AND subject = ?"
      )
      .get('0x1111111111111111111111111111111111111111') as
      { user_id: number; chain_id: string } | undefined;

    expect(identity).toBeDefined();
    expect(identity!.chain_id).toBe('eip155:1');

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(identity!.user_id) as {
      email: string | null;
    };
    expect(user.email).toBeNull();
  });

  it('rekeys email memberships and folds in wallet memberships', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const members = db
      .prepare(
        'SELECT kind, identifier FROM project_members WHERE project_id = 10 ORDER BY kind, identifier'
      )
      .all() as { kind: string; identifier: string }[];

    expect(members).toEqual([
      { kind: 'eip155', identifier: '0x1111111111111111111111111111111111111111' },
      { kind: 'email', identifier: 'bob@corp.com' },
      // Lowercased on the way across. The literal is hardcoded rather than
      // computed from the seed, so a dropped lower() cannot pass by symmetry.
      { kind: 'email', identifier: 'carol.danvers@corp.com' },
    ]);
  });

  it('drops the superseded tables and column', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).not.toContain('wallet_users');
    expect(tables).not.toContain('wallet_project_members');

    const projectCols = (db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(projectCols).not.toContain('owner_wallet_address');
  });

  it('lowercases a mixed-case wallet address into the eip155 identity subject', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    // Looked up by the lowercased literal: if migration 3 ever dropped its
    // .toLowerCase() call, the stored subject would still be mixed-case and
    // this lookup would find nothing.
    const identity = db
      .prepare("SELECT user_id FROM user_identities WHERE provider = 'eip155' AND subject = ?")
      .get(MIXED_CASE_WALLET_LOWER) as { user_id: number } | undefined;

    expect(identity).toBeDefined();
  });

  it('folds a mixed-case wallet membership into project_members with a lowercased identifier', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const member = db
      .prepare("SELECT identifier FROM project_members WHERE project_id = 11 AND kind = 'eip155'")
      .get() as { identifier: string } | undefined;

    expect(member?.identifier).toBe(MIXED_CASE_WALLET_LOWER);
  });

  it('resolves wallet-owned project ownership case-insensitively', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    const identity = db
      .prepare("SELECT user_id FROM user_identities WHERE provider = 'eip155' AND subject = ?")
      .get(MIXED_CASE_WALLET_LOWER) as { user_id: number } | undefined;
    expect(identity).toBeDefined();

    // Seeded owner_id was 1 (a placeholder); migration 3 must move it to the
    // account behind the wallet by matching the checksummed
    // owner_wallet_address on the project row case-insensitively against the
    // already-lowercased identity subject.
    const project = db.prepare('SELECT owner_id FROM projects WHERE id = 12').get() as {
      owner_id: number;
    };
    expect(project.owner_id).toBe(identity!.user_id);
    expect(project.owner_id).not.toBe(1);
  });

  it('leaves ownership untouched when owner_wallet_address matches no identity', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    // No wallet_users row (and so no eip155 identity) exists for
    // ORPHAN_WALLET; the EXISTS guard must leave the seeded owner_id alone
    // rather than nulling it out (owner_id is NOT NULL).
    const project = db.prepare('SELECT owner_id FROM projects WHERE id = 13').get() as {
      owner_id: number;
    };
    expect(project.owner_id).toBe(5);
  });
});

/**
 * A database as an already-migrated instance looks: current schema, versions
 * 1-4 recorded as applied. Migration 4 has therefore already run — with the
 * body that copied `email` verbatim — so fixing that body helps nobody here.
 * Migration 5 is the repair for these.
 */
function createPostMigration4Db(members: [number, string][]): string {
  const dir = mkdtempSync(join(tmpdir(), 'kb-postmig4-'));
  tempDirs.push(dir);
  const path = join(dir, 'post4.db');
  const db = new Database(path);

  db.exec(`
    CREATE TABLE schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO schema_version (version, name) VALUES
      (1, 'create user_identities'),
      (2, 'rebuild users without google_id and with nullable email'),
      (3, 'fold wallet_users into users and user_identities'),
      (4, 'rekey project_members and drop superseded tables');

    CREATE TABLE users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT,
      name       TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#346ddb',
      icon_url     TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE project_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      identifier TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, kind, identifier)
    );

    INSERT INTO users (id, email, name) VALUES (1, 'alice@corp.com', 'Alice');
    INSERT INTO projects (id, owner_id, slug, name) VALUES (20, 1, 'already-migrated', 'Docs');
  `);

  const insert = db.prepare(
    'INSERT INTO project_members (project_id, kind, identifier) VALUES (?, ?, ?)'
  );
  for (const [projectId, identifier] of members) insert.run(projectId, 'email', identifier);

  db.close();
  return path;
}

describe('email member identifier normalization (migration 5)', () => {
  it('lowercases a mixed-case email member on an already-migrated database', () => {
    setRuntimeConfig({
      databasePath: createPostMigration4Db([[20, 'Carol.Danvers@Corp.com']]),
    });
    const db = useDb();

    const rows = db
      .prepare("SELECT identifier FROM project_members WHERE kind = 'email'")
      .all() as { identifier: string }[];

    expect(rows.map((r) => r.identifier)).toEqual(['carol.danvers@corp.com']);
  });

  it('collapses a mixed-case row onto its existing lowercase twin instead of failing the UNIQUE', () => {
    // UNIQUE (project_id, kind, identifier) would reject a bare UPDATE here.
    // Both rows are the same person, so one row must survive — and the
    // migration must not throw, which would abort every later boot.
    setRuntimeConfig({
      databasePath: createPostMigration4Db([
        [20, 'dave@corp.com'],
        [20, 'Dave@Corp.com'],
      ]),
    });
    const db = useDb();

    const rows = db
      .prepare("SELECT identifier FROM project_members WHERE kind = 'email'")
      .all() as { identifier: string }[];

    expect(rows.map((r) => r.identifier)).toEqual(['dave@corp.com']);
  });

  it('leaves wallet identifiers alone', () => {
    const path = createPostMigration4Db([]);
    const seed = new Database(path);
    // Solana addresses are base58 and case-sensitive — lowercasing one would
    // destroy the identity it points at.
    seed
      .prepare(
        "INSERT INTO project_members (project_id, kind, identifier) VALUES (20, 'solana', ?)"
      )
      .run('SoLaNaAddress11111111111111111111111111111');
    seed.close();

    setRuntimeConfig({ databasePath: path });
    const db = useDb();

    const row = db
      .prepare("SELECT identifier FROM project_members WHERE kind = 'solana'")
      .get() as { identifier: string };
    expect(row.identifier).toBe('SoLaNaAddress11111111111111111111111111111');
  });

  it('is a no-op on a second boot', () => {
    const path = createPostMigration4Db([[20, 'Erin@Corp.com']]);
    setRuntimeConfig({ databasePath: path });
    useDb();
    closeDb();

    setRuntimeConfig({ databasePath: path });
    const db = useDb();

    const rows = db
      .prepare("SELECT identifier FROM project_members WHERE kind = 'email'")
      .all() as { identifier: string }[];
    expect(rows.map((r) => r.identifier)).toEqual(['erin@corp.com']);

    const applied = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number };
    expect(applied.n).toBe(5);
  });
});
