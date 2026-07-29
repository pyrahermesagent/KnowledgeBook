# Multi-Chain Wallet Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people sign in with Polkadot, Solana or Ethereum wallets as well as Google, all resolving to one unified account.

**Architecture:** One `users` row per person; every login method is a row in a new `user_identities` table keyed `UNIQUE (provider, subject)`. Three chain adapters supply message building, parsing and signature verification behind one shared verifier that owns all nonce/TTL/domain/replay logic. Because a wallet login populates the same `session.user` as Google, the existing parallel wallet authorization layer is deleted rather than extended.

**Tech Stack:** Nuxt 3 + Nitro, better-sqlite3, nuxt-auth-utils, vitest. viem (EVM), `@noble/curves` + `@scure/base` (Solana ed25519/base58), `@polkadot/util-crypto` (Polkadot sr25519/SS58).

**Design spec:** `docs/superpowers/specs/2026-07-27-multi-chain-wallet-auth-design.md`

## Global Constraints

- **The central invariant.** The address is bound inside the signed message. Verification always uses the address parsed out of that message, never a separate request field. The `address` in a request body is used only to build a message and is otherwise ignored.
- **The Polkadot adapter must use `signatureVerify`, never `sr25519Verify`.** The polkadot.js extension wraps payloads in `<Bytes>…</Bytes>` before signing. `signatureVerify` handles wrapped and unwrapped forms; `sr25519Verify` does not and fails silently as "invalid signature".
- **`await cryptoWaitReady()`** before any Polkadot verification (WASM init).
- **Canonical `subject` per provider:** `eip155` → `getAddress(a).toLowerCase()`; `solana` → base58 **case preserved**; `polkadot` → `encodeAddress(decodeAddress(a), 42)`; `google` → OAuth `sub`.
- **Chain allowlist applies to `eip155` only.** Solana and Polkadot `chain_id` values are client-reported, stored for display, and never trusted for authorization.
- **Table rebuilds must preserve primary key values** by copying `id` explicitly. `user_identities.user_id`, `projects.owner_id`, `user_encryption_access.user_id` and `page_versions.author_id` all reference `users(id)`.
- **`@noble/curves` v2 subpath imports must carry the `.js` suffix.** The installed
  2.2.0 exports `./ed25519.js` only; the bare `@noble/curves/ed25519` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. The v2 API is otherwise identical to v1 for
  what this plan uses (`getPublicKey`, `sign`, `verify`), and `@scure/base` 2.2.0
  keeps `base58.encode` / `base58.decode` unchanged — both verified against the
  installed versions.
- **`npm test` is the gate, not `npm run typecheck`.** This repo has ~237
  pre-existing `vue-tsc` errors on `main`, most of them from `useRuntimeConfig()`
  resolving to `{}` (so `config.web3.appDomain` errors even though the key
  exists). Measured at merge base 234926f, before any work on this branch. Steps
  below that say "run typecheck, expect no errors" mean **no NEW errors beyond
  that baseline** — compare counts, do not expect zero. A green full test suite
  is the real signal.
- **Test commands:** whole suite `npm test`; one file `npx vitest run tests/<file>.test.ts`; one case `npx vitest run tests/<file>.test.ts -t "<name>"`.
- **Test harness:** tests import real server modules via the `#utils` alias. `tests/setup/nuxt-globals.ts` installs stand-ins for Nuxt auto-imports; `createTestDb()` / `destroyTestDbs()` from `tests/setup/db.ts` give each test a fresh on-disk SQLite file. Never mock cryptography — every test signs with a real deterministic key.
- **Commit format:** conventional commits (commitlint is enforced by a husky hook).

---

## File Structure

**Server — created:**

| File                                           | Responsibility                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `server/utils/migrations.ts`                   | `schema_version` table + ordered migration steps                                           |
| `server/utils/auth/types.ts`                   | `Provider`, `StoredNonce`, `MessageInput`, `ParsedMessage`, `ChainAdapter`, `NONCE_TTL_MS` |
| `server/utils/auth/chains/eip155.ts`           | SIWE build/parse + viem recovery                                                           |
| `server/utils/auth/chains/solana.ts`           | SIWS-format build/parse + ed25519 verify                                                   |
| `server/utils/auth/chains/polkadot.ts`         | Plain-text build/parse + `signatureVerify`                                                 |
| `server/utils/auth/chains/index.ts`            | `getAdapter(provider)` registry                                                            |
| `server/utils/auth/verify.ts`                  | Shared verifier, `generateNonce`, `getAuthConfig`                                          |
| `server/utils/auth/identities.ts`              | `resolveIdentity`, `listIdentities`, `unlinkIdentity`                                      |
| `server/api/account/identities/index.get.ts`   | List linked login methods                                                                  |
| `server/api/account/identities/[id].delete.ts` | Unlink, refusing the last                                                                  |

**Server — modified:** `server/utils/db.ts` (call `runMigrations`), `server/utils/auth.ts` (membership by identity), `server/api/auth/wallet/login-message.post.ts`, `server/api/auth/wallet/login.post.ts`, `server/api/auth/google.get.ts`, `nuxt.config.ts`, `.env.example`.

**Server — deleted:** `server/utils/auth-wallet.ts`, `server/api/auth/wallet/get-nonce.post.ts`, `server/api/auth/wallet/logout.post.ts`, `middleware/wallet-auth.ts`.

**Client — created:** `utils/wallets/{types,eip155,solana,polkadot}.ts`, `composables/useWalletAuth.ts`, `components/auth/SignInPanel.vue`, `pages/dashboard/account.vue`.

**Client — rewritten:** `components/wallet/WalletModal.vue`, `components/wallet/ConnectButton.vue`. **Modified:** `pages/index.vue`.

**Tests — created:** `tests/migrations.test.ts`, `tests/auth-chain-eip155.test.ts`, `tests/auth-chain-solana.test.ts`, `tests/auth-chain-polkadot.test.ts`, `tests/auth-verify.test.ts`, `tests/auth-identities.test.ts`, `tests/auth-membership.test.ts`. **Deleted:** `tests/auth-wallet.test.ts` (superseded; its coverage moves to the eip155 and verify test files).

---

## Task 1: Dependencies and shared auth types

**Files:**

- Modify: `package.json`
- Modify: `nuxt.config.ts` (runtimeConfig `web3` block)
- Modify: `.env.example`
- Modify: `tests/setup/nuxt-globals.ts` (`TestRuntimeConfig.web3`)
- Create: `server/utils/auth/types.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Provider`, `WalletProvider`, `StoredNonce`, `MessageInput`, `ParsedMessage`, `ChainAdapter`, `NONCE_TTL_MS` from `#utils/auth/types`. Runtime config key `web3.evmChainIds` (comma-separated string).

- [ ] **Step 1: Install dependencies**

```bash
npm install @polkadot/util-crypto@^14 @polkadot/util@^14 @polkadot/extension-dapp@^0.63 @wallet-standard/app @noble/curves @scure/base
```

`@noble/curves` and `@scure/base` are already present transitively via viem, and `@polkadot/util` via `@polkadot/util-crypto`; all three are promoted to direct dependencies because adapter and test code import them by name, and a transitive dependency can be hoisted away by any unrelated upgrade.

- [ ] **Step 2: Replace the `web3.chainId` config with an allowlist**

In `nuxt.config.ts`, replace the `web3` block:

```ts
    web3: {
      // Comma-separated EIP-155 chain ids accepted in a SIWE login message.
      // Identity is ecosystem-wide, so this only constrains which chain a user
      // may be connected to while signing — not who they are.
      evmChainIds: '1,10,137,8453,42161',
      appDomain: 'localhost:3000',
      appUri: 'http://localhost:3000/login',
    },
```

- [ ] **Step 3: Update `.env.example`**

Replace the `NUXT_WEB3_CHAIN_ID=1` line with:

```
NUXT_WEB3_EVM_CHAIN_IDS=1,10,137,8453,42161
```

- [ ] **Step 4: Update the test runtime config**

In `tests/setup/nuxt-globals.ts`, change the `web3` field of `TestRuntimeConfig` and its default:

```ts
web3: {
  evmChainIds: string;
  appDomain: string;
  appUri: string;
}
```

```ts
  web3: {
    evmChainIds: '1,10,137,8453,42161',
    appDomain: 'test.knowledgebook.app',
    appUri: 'https://test.knowledgebook.app/login',
  },
```

- [ ] **Step 5: Create the shared types**

```ts
// server/utils/auth/types.ts

/** Every way an account can be logged into. */
export type Provider = 'google' | 'eip155' | 'solana' | 'polkadot';

/** The providers that sign a challenge message. */
export type WalletProvider = Exclude<Provider, 'google'>;

export const WALLET_PROVIDERS: readonly WalletProvider[] = ['eip155', 'solana', 'polkadot'];

/** How long a login challenge stays valid before it must be reissued. */
export const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The challenge held in the session between /login-message and /login.
 *
 * provider and address are part of the challenge — not just the nonce — so a
 * challenge issued for one ecosystem cannot be spent on a message built for
 * another.
 */
export interface StoredNonce {
  value: string;
  issuedAt: number;
  provider: WalletProvider;
  /** Canonical form, as produced by the adapter's canonicalize(). */
  address: string;
}

/** Everything an adapter needs to compose the message a wallet will sign. */
export interface MessageInput {
  address: string;
  nonce: string;
  issuedAt: string;
  domain: string;
  uri: string;
  /** eip155 only; ignored by the other adapters. */
  chainId?: number;
}

/** The fields the server must re-check, read back out of a signed message. */
export interface ParsedMessage {
  address: string;
  domain: string;
  nonce: string;
  issuedAt: string;
  /** Present for eip155 only. */
  chainId?: number;
}

/**
 * Per-ecosystem message format and signature check.
 *
 * Everything security-critical that is NOT ecosystem-specific — nonce lookup,
 * TTL, replay, domain, chain allowlist — lives in verify.ts, once.
 */
export interface ChainAdapter {
  provider: WalletProvider;
  /** Validate and normalize an address, or throw a 400. */
  canonicalize(address: string): string;
  buildMessage(input: MessageInput): string;
  /** Null when the message is not one we issued. */
  parseMessage(message: string): ParsedMessage | null;
  /** address is always the one parsed out of the message. */
  verify(message: string, signature: string, address: string): Promise<boolean>;
}
```

- [ ] **Step 6: Verify the project still builds and tests pass**

Run: `npx vitest run tests/auth-wallet.test.ts`
Expected: PASS — nothing has changed behaviorally yet. If it fails on `web3.chainId`, the existing `getWeb3Config()` still reads the old key; that is expected and is fixed in Task 5, so leave it.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts .env.example tests/setup/nuxt-globals.ts server/utils/auth/types.ts
git commit -m "feat(auth): add multi-chain auth types and EVM chain allowlist config"
```

---

## Task 2: Migration runner and `user_identities`

**Files:**

- Create: `server/utils/migrations.ts`
- Modify: `server/utils/db.ts` (call `runMigrations` at the end of `initSchema`)
- Test: `tests/migrations.test.ts`

**Interfaces:**

- Consumes: `Provider` from `#utils/auth/types`.
- Produces: `runMigrations(db)`, `MIGRATIONS` array, and the `user_identities` table with `UNIQUE (provider, subject)`.

- [ ] **Step 1: Write the failing test**

```ts
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

    INSERT INTO users (id, google_id, email, name) VALUES
      (1, 'google-sub-alice', 'alice@corp.com', 'Alice'),
      (2, 'google-sub-bob',   'bob@corp.com',   'Bob');
    INSERT INTO wallet_users (id, wallet_address, chain_id) VALUES
      (1, '0x1111111111111111111111111111111111111111', 1);
    INSERT INTO projects (id, owner_id, slug, name) VALUES
      (10, 1, 'alice-docs', 'Alice Docs');
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
      { user_id: 2, subject: 'google-sub-bob' },
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
          "INSERT INTO user_identities (user_id, provider, subject) VALUES (2, 'eip155', '0xaaa')"
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/migrations.test.ts`
Expected: FAIL — `no such table: user_identities`.

- [ ] **Step 3: Write the migration runner**

```ts
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
```

- [ ] **Step 4: Call it from `initSchema`**

In `server/utils/db.ts`, add the import at the top:

```ts
import { runMigrations } from './migrations';
```

and as the **last statement** of `initSchema()`, after the existing `db.exec` that creates the indexes:

```ts
// Rebuilds and data moves that ensureColumn cannot express.
runMigrations(db);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/migrations.test.ts`
Expected: PASS — all three cases.

- [ ] **Step 6: Commit**

```bash
git add server/utils/migrations.ts server/utils/db.ts tests/migrations.test.ts
git commit -m "feat(db): add migration runner and user_identities table"
```

---

## Task 3: Rebuild `users` — drop `google_id`, make `email` nullable

**Files:**

- Modify: `server/utils/migrations.ts` (add migration 2)
- Modify: `server/utils/db.ts` (`users` CREATE TABLE for fresh databases)
- Modify: `server/api/auth/google.get.ts`
- Test: `tests/migrations.test.ts`

**Interfaces:**

- Consumes: `runMigrations`, `user_identities` from Task 2.
- Produces: a `users` table of `(id, email TEXT NULL, name, avatar, created_at)`. Google sign-in now resolves through `user_identities`.

- [ ] **Step 1: Write the failing test**

Append to `tests/migrations.test.ts`:

```ts
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

    // Ids must survive: projects.owner_id points at them.
    const alice = db.prepare('SELECT id, email FROM users WHERE id = 1').get() as {
      id: number;
      email: string;
    };
    expect(alice.email).toBe('alice@corp.com');

    const project = db.prepare('SELECT owner_id FROM projects WHERE id = 10').get() as {
      owner_id: number;
    };
    expect(project.owner_id).toBe(1);
  });

  it('allows an emailless user once rebuilt', () => {
    setRuntimeConfig({ databasePath: createPreMigrationDb() });
    const db = useDb();

    expect(() =>
      db.prepare("INSERT INTO users (name, avatar) VALUES ('Wallet person', '')").run()
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/migrations.test.ts -t "drops google_id"`
Expected: FAIL — `google_id` is still present.

- [ ] **Step 3: Add migration 2**

Append to the `MIGRATIONS` array in `server/utils/migrations.ts`:

```ts
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
```

- [ ] **Step 4: Disable foreign keys around the migration run**

`PRAGMA foreign_keys` is a no-op inside a transaction, so `runMigrations` must toggle it outside. In `server/utils/migrations.ts`, change `runMigrations` so the loop is wrapped:

```ts
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
```

Replace the existing bare `for` loop with the block above.

- [ ] **Step 5: Update the fresh-database schema**

In `server/utils/db.ts`, replace the `users` CREATE TABLE inside `initSchema` with:

```sql
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT,
      name       TEXT NOT NULL DEFAULT '',
      avatar     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 6: Rewrite Google sign-in to go through identities**

Replace the body of `server/api/auth/google.get.ts`:

The old handler wrote `users (google_id, ...)`, and that column no longer exists,
so it must be rewritten in the same task that removes it. `resolveIdentity` does
not exist until Task 9, so this writes the two tables directly for now; Task 9
Step 5 replaces this body with a `resolveIdentity` call once that function
exists. Every task must leave a repo that type-checks.

```ts
export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    try {
      const db = useDb();
      const sub = String(user.sub);

      const upsert = db.transaction(() => {
        const identity = db
          .prepare("SELECT user_id FROM user_identities WHERE provider = 'google' AND subject = ?")
          .get(sub) as { user_id: number } | undefined;

        if (identity) {
          db.prepare('UPDATE users SET email = ?, name = ?, avatar = ? WHERE id = ?').run(
            user.email ?? null,
            user.name ?? '',
            user.picture ?? '',
            identity.user_id
          );
          db.prepare(
            "UPDATE user_identities SET last_used_at = datetime('now') WHERE provider = 'google' AND subject = ?"
          ).run(sub);
          return identity.user_id;
        }

        const { id } = db
          .prepare('INSERT INTO users (email, name, avatar) VALUES (?, ?, ?) RETURNING id')
          .get(user.email ?? null, user.name ?? '', user.picture ?? '') as { id: number };

        db.prepare(
          `INSERT INTO user_identities (user_id, provider, subject, last_used_at)
           VALUES (?, 'google', ?, datetime('now'))`
        ).run(id, sub);

        return id;
      });

      const userId = upsert();

      const row = db
        .prepare('SELECT id, email, name, avatar FROM users WHERE id = ?')
        .get(userId) as { id: number; email: string | null; name: string; avatar: string };

      await setUserSession(event, { user: row });
    } catch (error) {
      console.error('Google OAuth callback failed after token exchange:', error);
      return sendRedirect(event, '/?auth_error=1');
    }
    return sendRedirect(event, '/dashboard');
  },
  onError(event, error) {
    console.error('Google OAuth error:', error);
    return sendRedirect(event, '/?auth_error=1');
  },
});
```

- [ ] **Step 7: Run the migration tests to verify they pass**

Run: `npx vitest run tests/migrations.test.ts`
Expected: PASS — all five cases.

- [ ] **Step 8: Commit**

```bash
git add server/utils/migrations.ts server/utils/db.ts server/api/auth/google.get.ts tests/migrations.test.ts
git commit -m "feat(db): rebuild users table with nullable email and no google_id"
```

---

## Task 4: Fold wallet users and memberships into the unified model

**Files:**

- Modify: `server/utils/migrations.ts` (migrations 3 and 4)
- Modify: `server/utils/db.ts` (`project_members` CREATE TABLE; remove `wallet_users` and `wallet_project_members`; remove the `owner_wallet_address` `ensureColumn`)
- Test: `tests/migrations.test.ts`

**Interfaces:**

- Consumes: migrations 1–2.
- Produces: `project_members(id, project_id, kind, identifier, role, added_at)` with `UNIQUE (project_id, kind, identifier)`. `wallet_users`, `wallet_project_members` and `projects.owner_wallet_address` no longer exist.

- [ ] **Step 1: Write the failing test**

Append to `tests/migrations.test.ts`:

```ts
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
      .prepare('SELECT kind, identifier FROM project_members WHERE project_id = 10 ORDER BY kind')
      .all() as { kind: string; identifier: string }[];

    expect(members).toEqual([
      { kind: 'eip155', identifier: '0x1111111111111111111111111111111111111111' },
      { kind: 'email', identifier: 'bob@corp.com' },
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/migrations.test.ts -t "wallet fold-in"`
Expected: FAIL — no `eip155` identity exists.

- [ ] **Step 3: Add migrations 3 and 4**

Append to `MIGRATIONS` in `server/utils/migrations.ts`:

```ts
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
          INSERT INTO project_members_new (id, project_id, kind, identifier, role, added_at)
            SELECT id, project_id, 'email', email, 'member', added_at FROM project_members;
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
```

- [ ] **Step 4: Update the fresh-database schema**

In `server/utils/db.ts`: replace the `project_members` CREATE TABLE with

```sql
    CREATE TABLE IF NOT EXISTS project_members (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      identifier TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, kind, identifier)
    );
```

Delete the `wallet_users` and `wallet_project_members` CREATE TABLE statements, the `ensureColumn(db, 'projects', 'owner_wallet_address', 'TEXT');` line, and the `idx_wallet_users_address` / `idx_wallet_project_access` index statements.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/migrations.test.ts`
Expected: PASS — all eight cases.

- [ ] **Step 6: Commit**

```bash
git add server/utils/migrations.ts server/utils/db.ts tests/migrations.test.ts
git commit -m "feat(db): fold wallet users and memberships into the unified account model"
```

---

## Task 5: EVM chain adapter

**Files:**

- Create: `server/utils/auth/chains/eip155.ts`
- Test: `tests/auth-chain-eip155.test.ts`

**Interfaces:**

- Consumes: `ChainAdapter`, `MessageInput`, `ParsedMessage` from `#utils/auth/types`.
- Produces: `eip155Adapter: ChainAdapter`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-chain-eip155.test.ts
import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { eip155Adapter } from '#utils/auth/chains/eip155';

// Deterministic test key — never used outside these tests.
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PRIVATE_KEY);
const ADDRESS = account.address.toLowerCase();

const input = {
  address: ADDRESS,
  nonce: 'a'.repeat(64),
  issuedAt: '2026-07-27T10:00:00.000Z',
  domain: 'test.knowledgebook.app',
  uri: 'https://test.knowledgebook.app/login',
  chainId: 1,
};

describe('eip155Adapter.canonicalize', () => {
  it('lowercases a checksummed address', () => {
    expect(eip155Adapter.canonicalize(account.address)).toBe(ADDRESS);
  });

  it('rejects a non-address', () => {
    expect(() => eip155Adapter.canonicalize('nope')).toThrow();
    expect(() => eip155Adapter.canonicalize('0x123')).toThrow();
  });

  it('rejects a base58 address belonging to another ecosystem', () => {
    expect(() =>
      eip155Adapter.canonicalize('7Xy9dKpQ2mVn4bTsRfGhJkLmNpQrStUvWxYzAbCdEfGh')
    ).toThrow();
  });
});

describe('eip155Adapter message round-trip', () => {
  it('parses back every field it wrote', () => {
    const parsed = eip155Adapter.parseMessage(eip155Adapter.buildMessage(input));

    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(ADDRESS);
    expect(parsed!.domain).toBe(input.domain);
    expect(parsed!.nonce).toBe(input.nonce);
    expect(parsed!.chainId).toBe(1);
    expect(parsed!.issuedAt).toBe(input.issuedAt);
  });

  it('checksums the address in the message body', () => {
    // SIWE clients reject a lowercased address, so the message must carry the
    // EIP-55 form even though we store and compare the lowercased one.
    expect(eip155Adapter.buildMessage(input)).toContain(account.address);
  });

  it('returns null for a message we did not issue', () => {
    expect(eip155Adapter.parseMessage('hello world')).toBeNull();
  });
});

describe('eip155Adapter.verify', () => {
  it('accepts a signature from the address in the message', async () => {
    const message = eip155Adapter.buildMessage(input);
    const signature = await account.signMessage({ message });

    await expect(eip155Adapter.verify(message, signature, ADDRESS)).resolves.toBe(true);
  });

  it('rejects a signature over different content', async () => {
    const message = eip155Adapter.buildMessage(input);
    const signature = await account.signMessage({ message: 'something else entirely' });

    await expect(eip155Adapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a valid signature paired with someone else’s address', async () => {
    const message = eip155Adapter.buildMessage(input);
    const signature = await account.signMessage({ message });
    const other = '0x2222222222222222222222222222222222222222';

    await expect(eip155Adapter.verify(message, signature, other)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const message = eip155Adapter.buildMessage(input);
    await expect(eip155Adapter.verify(message, '0xdeadbeef', ADDRESS)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-chain-eip155.test.ts`
Expected: FAIL — cannot resolve `#utils/auth/chains/eip155`.

- [ ] **Step 3: Write the adapter**

```ts
// server/utils/auth/chains/eip155.ts
import { recoverMessageAddress, isAddress, getAddress } from 'viem';
import type { ChainAdapter, MessageInput, ParsedMessage } from '../types';

const STATEMENT = 'Please sign this message to confirm your identity.';

/**
 * Sign-In with Ethereum (EIP-4361).
 *
 * EVM is the one ecosystem where the signer can be recovered from the
 * signature, so verify() recovers and compares rather than checking against a
 * supplied key.
 */
export const eip155Adapter: ChainAdapter = {
  provider: 'eip155',

  canonicalize(address: string): string {
    if (!isAddress(address)) {
      throw createError({ statusCode: 400, message: 'Invalid Ethereum address' });
    }
    return getAddress(address).toLowerCase();
  },

  buildMessage(input: MessageInput): string {
    // EIP-4361 requires the EIP-55 checksummed form, and SIWE clients that
    // validate the message reject a lowercased one. Callers pass the canonical
    // (lowercase) form used for storage, so checksum it for the message only —
    // parseMessage and verify are both case-insensitive.
    const checksummed = getAddress(input.address);

    return [
      `${input.domain} wants you to sign in with your Ethereum account:`,
      '',
      checksummed,
      '',
      STATEMENT,
      `URI: ${input.uri}`,
      `Chain ID: ${input.chainId}`,
      `Nonce: ${input.nonce}`,
      `Issued At: ${input.issuedAt}`,
    ].join('\n');
  },

  parseMessage(message: string): ParsedMessage | null {
    const domain = message.match(/^(.+?) wants you to sign in with your Ethereum account:/)?.[1];
    const address = message.match(/\n\n(0x[a-fA-F0-9]{40})\n\n/)?.[1];
    const chainId = message.match(/\nChain ID: (\d+)/)?.[1];
    const nonce = message.match(/\nNonce: ([a-f0-9]{64})/)?.[1];
    const issuedAt = message.match(/\nIssued At: (.+)$/)?.[1];

    if (!domain || !address || !chainId || !nonce || !issuedAt) return null;

    return { domain, address: address.toLowerCase(), chainId: Number(chainId), nonce, issuedAt };
  },

  async verify(message: string, signature: string, address: string): Promise<boolean> {
    try {
      const recovered = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      });
      return recovered.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth-chain-eip155.test.ts`
Expected: PASS — all ten cases.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth/chains/eip155.ts tests/auth-chain-eip155.test.ts
git commit -m "feat(auth): add eip155 chain adapter"
```

---

## Task 6: Solana chain adapter

**Files:**

- Create: `server/utils/auth/chains/solana.ts`
- Test: `tests/auth-chain-solana.test.ts`

**Interfaces:**

- Consumes: `ChainAdapter` from `#utils/auth/types`.
- Produces: `solanaAdapter: ChainAdapter`. Signatures are base58-encoded strings.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-chain-solana.test.ts
import { describe, it, expect } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { solanaAdapter } from '#utils/auth/chains/solana';

// Deterministic 32-byte seed — never used outside these tests.
const SEED = new Uint8Array(32).fill(7);
const PUBLIC_KEY = ed25519.getPublicKey(SEED);
const ADDRESS = base58.encode(PUBLIC_KEY);

const input = {
  address: ADDRESS,
  nonce: 'b'.repeat(64),
  issuedAt: '2026-07-27T10:00:00.000Z',
  domain: 'test.knowledgebook.app',
  uri: 'https://test.knowledgebook.app/login',
};

const sign = (message: string): string =>
  base58.encode(ed25519.sign(new TextEncoder().encode(message), SEED));

describe('solanaAdapter.canonicalize', () => {
  it('preserves case — lowercasing would be a different key entirely', () => {
    const canonical = solanaAdapter.canonicalize(ADDRESS);
    expect(canonical).toBe(ADDRESS);
    expect(canonical).not.toBe(ADDRESS.toLowerCase());
  });

  it('rejects an EVM address', () => {
    expect(() =>
      solanaAdapter.canonicalize('0x1111111111111111111111111111111111111111')
    ).toThrow();
  });

  it('rejects base58 that does not decode to 32 bytes', () => {
    expect(() => solanaAdapter.canonicalize('abc')).toThrow();
  });

  it('rejects characters outside the base58 alphabet', () => {
    expect(() => solanaAdapter.canonicalize('0OIl' + ADDRESS.slice(4))).toThrow();
  });
});

describe('solanaAdapter message round-trip', () => {
  it('parses back every field it wrote, case intact', () => {
    const parsed = solanaAdapter.parseMessage(solanaAdapter.buildMessage(input));

    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(ADDRESS);
    expect(parsed!.domain).toBe(input.domain);
    expect(parsed!.nonce).toBe(input.nonce);
    expect(parsed!.issuedAt).toBe(input.issuedAt);
  });

  it('names the Solana ecosystem so a message cannot be routed to another adapter', () => {
    expect(solanaAdapter.buildMessage(input)).toContain('Solana account:');
  });

  it('returns null for a message we did not issue', () => {
    expect(solanaAdapter.parseMessage('hello world')).toBeNull();
  });
});

describe('solanaAdapter.verify', () => {
  it('accepts a signature from the address in the message', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, sign(message), ADDRESS)).resolves.toBe(true);
  });

  it('rejects a signature over different content', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, sign('other content'), ADDRESS)).resolves.toBe(
      false
    );
  });

  it('rejects a signature from a different key', async () => {
    const message = solanaAdapter.buildMessage(input);
    const otherSeed = new Uint8Array(32).fill(9);
    const signature = base58.encode(ed25519.sign(new TextEncoder().encode(message), otherSeed));

    await expect(solanaAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const message = solanaAdapter.buildMessage(input);
    await expect(solanaAdapter.verify(message, 'not-base58-!!', ADDRESS)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-chain-solana.test.ts`
Expected: FAIL — cannot resolve `#utils/auth/chains/solana`.

- [ ] **Step 3: Write the adapter**

```ts
// server/utils/auth/chains/solana.ts
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import type { ChainAdapter, MessageInput, ParsedMessage } from '../types';

const STATEMENT = 'Please sign this message to confirm your identity.';

/** A Solana address is a base58-encoded 32-byte ed25519 public key. */
function decodeAddress(address: string): Uint8Array | null {
  try {
    const bytes = base58.decode(address);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Sign-In with Solana.
 *
 * ed25519 cannot recover a signer from a signature, so verify() checks against
 * the public key decoded from the address carried inside the message — never
 * against anything supplied alongside the request.
 */
export const solanaAdapter: ChainAdapter = {
  provider: 'solana',

  canonicalize(address: string): string {
    // Case is significant in base58: lowercasing yields a different key, so the
    // address is returned exactly as given once validated.
    if (!decodeAddress(address)) {
      throw createError({ statusCode: 400, message: 'Invalid Solana address' });
    }
    return address;
  },

  buildMessage(input: MessageInput): string {
    return [
      `${input.domain} wants you to sign in with your Solana account:`,
      '',
      input.address,
      '',
      STATEMENT,
      `URI: ${input.uri}`,
      'Version: 1',
      `Nonce: ${input.nonce}`,
      `Issued At: ${input.issuedAt}`,
    ].join('\n');
  },

  parseMessage(message: string): ParsedMessage | null {
    const domain = message.match(/^(.+?) wants you to sign in with your Solana account:/)?.[1];
    const address = message.match(/\n\n([1-9A-HJ-NP-Za-km-z]{32,44})\n\n/)?.[1];
    const nonce = message.match(/\nNonce: ([a-f0-9]{64})/)?.[1];
    const issuedAt = message.match(/\nIssued At: (.+)$/)?.[1];

    if (!domain || !address || !nonce || !issuedAt) return null;
    if (!decodeAddress(address)) return null;

    return { domain, address, nonce, issuedAt };
  },

  async verify(message: string, signature: string, address: string): Promise<boolean> {
    const publicKey = decodeAddress(address);
    if (!publicKey) return false;

    try {
      return ed25519.verify(base58.decode(signature), new TextEncoder().encode(message), publicKey);
    } catch {
      return false;
    }
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth-chain-solana.test.ts`
Expected: PASS — all eleven cases.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth/chains/solana.ts tests/auth-chain-solana.test.ts
git commit -m "feat(auth): add solana chain adapter"
```

---

## Task 7: Polkadot chain adapter

**Files:**

- Create: `server/utils/auth/chains/polkadot.ts`
- Test: `tests/auth-chain-polkadot.test.ts`

**Interfaces:**

- Consumes: `ChainAdapter` from `#utils/auth/types`.
- Produces: `polkadotAdapter: ChainAdapter`, `initPolkadotCrypto(): Promise<void>`. Signatures are hex strings.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-chain-polkadot.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import {
  cryptoWaitReady,
  sr25519PairFromSeed,
  sr25519Sign,
  ed25519PairFromSeed,
  ed25519Sign,
  encodeAddress,
} from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { polkadotAdapter } from '#utils/auth/chains/polkadot';

// Deterministic 32-byte seed — never used outside these tests.
const SEED = new Uint8Array(32).fill(3);
let pair: ReturnType<typeof sr25519PairFromSeed>;
let ADDRESS: string;

const input = () => ({
  address: ADDRESS,
  nonce: 'c'.repeat(64),
  issuedAt: '2026-07-27T10:00:00.000Z',
  domain: 'test.knowledgebook.app',
  uri: 'https://test.knowledgebook.app/login',
});

beforeAll(async () => {
  await cryptoWaitReady();
  pair = sr25519PairFromSeed(SEED);
  ADDRESS = encodeAddress(pair.publicKey, 42);
});

const enc = (s: string) => new TextEncoder().encode(s);

describe('polkadotAdapter.canonicalize', () => {
  it('normalizes every network prefix of one key to a single identity', () => {
    const polkadot = encodeAddress(pair.publicKey, 0);
    const kusama = encodeAddress(pair.publicKey, 2);
    const generic = encodeAddress(pair.publicKey, 42);

    // Three different strings, one key — all must resolve to the same subject.
    expect(polkadot).not.toBe(kusama);
    expect(polkadotAdapter.canonicalize(polkadot)).toBe(generic);
    expect(polkadotAdapter.canonicalize(kusama)).toBe(generic);
    expect(polkadotAdapter.canonicalize(generic)).toBe(generic);
  });

  it('rejects an EVM address', () => {
    expect(() =>
      polkadotAdapter.canonicalize('0x1111111111111111111111111111111111111111')
    ).toThrow();
  });

  it('rejects a corrupted SS58 checksum', () => {
    const broken = ADDRESS.slice(0, -1) + (ADDRESS.endsWith('A') ? 'B' : 'A');
    expect(() => polkadotAdapter.canonicalize(broken)).toThrow();
  });
});

describe('polkadotAdapter message round-trip', () => {
  it('parses back every field it wrote', () => {
    const parsed = polkadotAdapter.parseMessage(polkadotAdapter.buildMessage(input()));

    expect(parsed).not.toBeNull();
    expect(parsed!.address).toBe(ADDRESS);
    expect(parsed!.domain).toBe('test.knowledgebook.app');
    expect(parsed!.nonce).toBe('c'.repeat(64));
  });

  it('returns null for a message we did not issue', () => {
    expect(polkadotAdapter.parseMessage('hello world')).toBeNull();
  });
});

describe('polkadotAdapter.verify', () => {
  it('accepts a plain sr25519 signature', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc(message), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(true);
  });

  it('accepts a <Bytes>-wrapped signature from the polkadot.js extension', async () => {
    // The extension wraps payloads in <Bytes>…</Bytes> before signing so a dApp
    // cannot trick a user into signing a transaction. This case fails if the
    // adapter is ever switched to the low-level sr25519Verify primitive.
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc(`<Bytes>${message}</Bytes>`), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(true);
  });

  it('accepts an ed25519 account', async () => {
    const edPair = ed25519PairFromSeed(new Uint8Array(32).fill(5));
    const edAddress = encodeAddress(edPair.publicKey, 42);
    const message = polkadotAdapter.buildMessage({ ...input(), address: edAddress });
    const signature = u8aToHex(ed25519Sign(enc(message), edPair));

    await expect(polkadotAdapter.verify(message, signature, edAddress)).resolves.toBe(true);
  });

  it('rejects a signature over different content', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const signature = u8aToHex(sr25519Sign(enc('<Bytes>attacker message</Bytes>'), pair));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const message = polkadotAdapter.buildMessage(input());
    const other = sr25519PairFromSeed(new Uint8Array(32).fill(8));
    const signature = u8aToHex(sr25519Sign(enc(message), other));

    await expect(polkadotAdapter.verify(message, signature, ADDRESS)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    const message = polkadotAdapter.buildMessage(input());
    await expect(polkadotAdapter.verify(message, '0xdeadbeef', ADDRESS)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-chain-polkadot.test.ts`
Expected: FAIL — cannot resolve `#utils/auth/chains/polkadot`.

- [ ] **Step 3: Write the adapter**

```ts
// server/utils/auth/chains/polkadot.ts
import {
  cryptoWaitReady,
  signatureVerify,
  decodeAddress,
  encodeAddress,
} from '@polkadot/util-crypto';
import type { ChainAdapter, MessageInput, ParsedMessage } from '../types';

const STATEMENT = 'Please sign this message to confirm your identity.';

/** The generic substrate prefix. One key has a different SS58 string per network. */
const GENERIC_PREFIX = 42;

let ready: Promise<boolean> | null = null;

/**
 * sr25519 verification runs in WASM that must finish initialising first.
 * Memoised, so concurrent logins share one initialisation.
 */
export function initPolkadotCrypto(): Promise<boolean> {
  if (!ready) ready = cryptoWaitReady();
  return ready;
}

export const polkadotAdapter: ChainAdapter = {
  provider: 'polkadot',

  canonicalize(address: string): string {
    try {
      // Decoding to the public key and re-encoding at the generic prefix means
      // the same account reached from Polkadot, Kusama or any parachain
      // resolves to one identity.
      return encodeAddress(decodeAddress(address), GENERIC_PREFIX);
    } catch {
      throw createError({ statusCode: 400, message: 'Invalid Polkadot address' });
    }
  },

  buildMessage(input: MessageInput): string {
    return [
      `${input.domain} wants you to sign in with your Polkadot account:`,
      '',
      input.address,
      '',
      STATEMENT,
      `URI: ${input.uri}`,
      `Nonce: ${input.nonce}`,
      `Issued At: ${input.issuedAt}`,
    ].join('\n');
  },

  parseMessage(message: string): ParsedMessage | null {
    const domain = message.match(/^(.+?) wants you to sign in with your Polkadot account:/)?.[1];
    const address = message.match(/\n\n([1-9A-HJ-NP-Za-km-z]{45,50})\n\n/)?.[1];
    const nonce = message.match(/\nNonce: ([a-f0-9]{64})/)?.[1];
    const issuedAt = message.match(/\nIssued At: (.+)$/)?.[1];

    if (!domain || !address || !nonce || !issuedAt) return null;

    try {
      decodeAddress(address);
    } catch {
      return null;
    }

    return { domain, address, nonce, issuedAt };
  },

  async verify(message: string, signature: string, address: string): Promise<boolean> {
    await initPolkadotCrypto();

    try {
      // signatureVerify — NOT the low-level sr25519Verify. The polkadot.js
      // extension signs <Bytes>…</Bytes>-wrapped payloads; this call handles the
      // wrapped and unwrapped forms, the primitive silently rejects the wrapped
      // one as an invalid signature.
      return signatureVerify(message, signature, address).isValid;
    } catch {
      return false;
    }
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth-chain-polkadot.test.ts`
Expected: PASS — all twelve cases. If `accepts a <Bytes>-wrapped signature` fails, the adapter is using `sr25519Verify`; switch it to `signatureVerify`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/auth/chains/polkadot.ts tests/auth-chain-polkadot.test.ts
git commit -m "feat(auth): add polkadot chain adapter"
```

---

## Task 8: Adapter registry and shared verifier

**Files:**

- Create: `server/utils/auth/chains/index.ts`
- Create: `server/utils/auth/verify.ts`
- Test: `tests/auth-verify.test.ts`
- Delete: `server/utils/auth-wallet.ts`, `tests/auth-wallet.test.ts`

**Interfaces:**

- Consumes: the three adapters; `StoredNonce`, `NONCE_TTL_MS`, `WalletProvider` from `#utils/auth/types`.
- Produces: `getAdapter(provider)`, `generateNonce()`, `getAuthConfig()`, `verifyLoginAttempt(provider, message, signature, stored)` returning `{ success, address, reason? }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-verify.test.ts
import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { generateNonce, verifyLoginAttempt, getAuthConfig } from '#utils/auth/verify';
import { getAdapter } from '#utils/auth/chains';
import { NONCE_TTL_MS, type StoredNonce } from '#utils/auth/types';
import { setRuntimeConfig } from './setup/nuxt-globals';

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PRIVATE_KEY);
const ADDRESS = account.address.toLowerCase();

const SOL_SEED = new Uint8Array(32).fill(7);
const SOL_ADDRESS = base58.encode(ed25519.getPublicKey(SOL_SEED));

const DOMAIN = 'test.knowledgebook.app';
const URI = 'https://test.knowledgebook.app/login';

function stored(over: Partial<StoredNonce> = {}): StoredNonce {
  return {
    value: generateNonce(),
    issuedAt: Date.now(),
    provider: 'eip155',
    address: ADDRESS,
    ...over,
  };
}

function evmMessage(nonce: string, over: Record<string, unknown> = {}): string {
  return getAdapter('eip155').buildMessage({
    address: ADDRESS,
    nonce,
    issuedAt: new Date().toISOString(),
    domain: DOMAIN,
    uri: URI,
    chainId: 1,
    ...over,
  });
}

describe('generateNonce', () => {
  it('produces a 64-char hex string', () => {
    expect(generateNonce()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 100 }, generateNonce)).size).toBe(100);
  });
});

describe('getAuthConfig', () => {
  it('parses the EVM chain allowlist', () => {
    setRuntimeConfig({ web3: { evmChainIds: '1,8453', appDomain: DOMAIN, appUri: URI } });
    expect(getAuthConfig().evmChainIds).toEqual([1, 8453]);
  });
});

describe('verifyLoginAttempt', () => {
  it('accepts a well-formed attempt and returns the canonical address', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(true);
    expect(result.address).toBe(ADDRESS);
  });

  it('rejects when no challenge was issued', async () => {
    const message = evmMessage(generateNonce());
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, undefined);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/no login challenge/i);
  });

  it('rejects an expired challenge', async () => {
    const challenge = stored({ issuedAt: Date.now() - NONCE_TTL_MS - 1000 });
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('rejects a nonce that is not the one issued', async () => {
    const challenge = stored();
    const message = evmMessage(generateNonce());
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/invalid login challenge/i);
  });

  it('rejects a message issued for another domain', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = evmMessage(challenge.value, { domain: 'evil.example' });
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/domain/i);
  });

  it('rejects a chain outside the allowlist', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = evmMessage(challenge.value, { chainId: 999 });
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/chain/i);
  });

  it('accepts any chain that is on the allowlist', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1,8453', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = evmMessage(challenge.value, { chainId: 8453 });
    const signature = await account.signMessage({ message });

    await expect(
      verifyLoginAttempt('eip155', message, signature, challenge)
    ).resolves.toMatchObject({ success: true });
  });

  it('rejects a challenge issued for a different ecosystem', async () => {
    // A challenge minted for a Solana login must not be spendable on an EVM
    // message, even though the nonce value itself matches.
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored({ provider: 'solana', address: SOL_ADDRESS });
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/different (ecosystem|account)/i);
  });

  it('rejects a challenge issued for a different address', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored({ address: '0x2222222222222222222222222222222222222222' });
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/different (ecosystem|account)/i);
  });

  it('rejects a bad signature', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message: 'different content' });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/signature/i);
  });

  it('rejects a malformed message', async () => {
    const result = await verifyLoginAttempt('eip155', 'nonsense', '0x00', stored());

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });

  it('verifies a Solana attempt through the same core', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored({ provider: 'solana', address: SOL_ADDRESS });
    const message = getAdapter('solana').buildMessage({
      address: SOL_ADDRESS,
      nonce: challenge.value,
      issuedAt: new Date().toISOString(),
      domain: DOMAIN,
      uri: URI,
    });
    const signature = base58.encode(ed25519.sign(new TextEncoder().encode(message), SOL_SEED));

    const result = await verifyLoginAttempt('solana', message, signature, challenge);

    expect(result.success).toBe(true);
    expect(result.address).toBe(SOL_ADDRESS);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-verify.test.ts`
Expected: FAIL — cannot resolve `#utils/auth/verify`.

- [ ] **Step 3: Write the registry**

```ts
// server/utils/auth/chains/index.ts
import type { ChainAdapter, WalletProvider } from '../types';
import { eip155Adapter } from './eip155';
import { solanaAdapter } from './solana';
import { polkadotAdapter } from './polkadot';

const ADAPTERS: Record<WalletProvider, ChainAdapter> = {
  eip155: eip155Adapter,
  solana: solanaAdapter,
  polkadot: polkadotAdapter,
};

/** Throws a 400 for anything that is not a supported ecosystem. */
export function getAdapter(provider: string): ChainAdapter {
  const adapter = ADAPTERS[provider as WalletProvider];
  if (!adapter) {
    throw createError({ statusCode: 400, message: `Unsupported wallet provider: ${provider}` });
  }
  return adapter;
}

export { eip155Adapter, solanaAdapter, polkadotAdapter };
```

- [ ] **Step 4: Write the shared verifier**

```ts
// server/utils/auth/verify.ts
import crypto from 'node:crypto';
import { getAdapter } from './chains';
import { NONCE_TTL_MS, type StoredNonce, type WalletProvider } from './types';

export interface VerifyResult {
  success: boolean;
  address: string;
  reason?: string;
}

/** A cryptographically random challenge value. */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Deployment-specific sign-in settings.
 *
 * The domain and URI are bound into every login message and re-checked here, so
 * a message signed for another deployment cannot be replayed against this one.
 */
export function getAuthConfig(): { domain: string; uri: string; evmChainIds: number[] } {
  const config = useRuntimeConfig();

  const evmChainIds = String(config.web3?.evmChainIds ?? '1')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  return {
    domain: config.web3?.appDomain || 'localhost:3000',
    uri: config.web3?.appUri || 'http://localhost:3000/login',
    evmChainIds: evmChainIds.length ? evmChainIds : [1],
  };
}

/** Constant-time compare, so a mismatching nonce cannot be probed byte by byte. */
function nonceMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Full server-side validation of a login attempt, shared by every ecosystem.
 *
 * A signature alone proves key custody but not freshness or intent, so the
 * message is also checked against the challenge this session was issued, the
 * configured domain, and — for EVM — the chain allowlist. The caller must have
 * already cleared the stored challenge so a captured signature cannot be
 * replayed.
 *
 * The returned address is the one parsed out of the signed message. It is the
 * only address a caller may trust.
 */
export async function verifyLoginAttempt(
  provider: WalletProvider,
  message: string,
  signature: string,
  storedNonce: StoredNonce | undefined
): Promise<VerifyResult> {
  const fail = (reason: string): VerifyResult => ({ success: false, address: '', reason });

  if (!storedNonce) return fail('No login challenge issued for this session');
  if (Date.now() - storedNonce.issuedAt > NONCE_TTL_MS) {
    return fail('Login challenge expired, please retry');
  }

  const adapter = getAdapter(provider);
  const parsed = adapter.parseMessage(message);
  if (!parsed) return fail('Malformed login message');

  if (!nonceMatches(storedNonce.value, parsed.nonce)) return fail('Invalid login challenge');

  // The challenge is bound to the ecosystem and account it was issued for, so
  // one minted for a Solana login cannot be spent on an EVM message.
  if (storedNonce.provider !== provider) {
    return fail('Login challenge was issued for a different ecosystem');
  }

  let canonical: string;
  try {
    canonical = adapter.canonicalize(parsed.address);
  } catch {
    return fail('Malformed login message');
  }
  if (canonical !== storedNonce.address) {
    return fail('Login challenge was issued for a different account');
  }

  const { domain, evmChainIds } = getAuthConfig();
  if (parsed.domain !== domain) return fail('Login message issued for a different domain');

  // Only SIWE carries a numeric chain id; the other ecosystems report chain
  // information that is stored for display and never trusted here.
  if (provider === 'eip155' && !evmChainIds.includes(parsed.chainId ?? -1)) {
    return fail('Login message issued for an unsupported chain');
  }

  if (!(await adapter.verify(message, signature, parsed.address))) {
    return fail('Invalid signature');
  }

  return { success: true, address: canonical };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/auth-verify.test.ts`
Expected: PASS — all fifteen cases.

- [ ] **Step 6: Delete only the superseded test**

```bash
git rm tests/auth-wallet.test.ts
```

Its coverage now lives in `tests/auth-chain-eip155.test.ts` and `tests/auth-verify.test.ts`.

**Leave `server/utils/auth-wallet.ts` in place.** Three endpoints under
`server/api/auth/wallet/` still import it, and they are not rewritten until Task
11 — deleting the module here would break the build for three tasks. Task 11
Step 3 removes it in the same commit that removes its last importer.

- [ ] **Step 7: Commit**

```bash
git add server/utils/auth/chains/index.ts server/utils/auth/verify.ts tests/auth-verify.test.ts
git commit -m "feat(auth): add adapter registry and shared multi-chain verifier"
```

---

## Task 9: Identity resolution

**Files:**

- Create: `server/utils/auth/identities.ts`
- Test: `tests/auth-identities.test.ts`

**Interfaces:**

- Consumes: `Provider` from `#utils/auth/types`; `user_identities` from Task 2.
- Produces: `resolveIdentity(input, currentUserId)` → `{ userId, linked, created }`; `listIdentities(userId)` → `IdentityRow[]`; `unlinkIdentity(userId, identityId)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-identities.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resolveIdentity, listIdentities, unlinkIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDbs();
});

const wallet = {
  provider: 'eip155' as const,
  subject: '0x1111111111111111111111111111111111111111',
  chainId: 'eip155:1',
  label: 'MetaMask',
};

describe('resolveIdentity', () => {
  it('creates an account when the identity is unknown and nobody is signed in', () => {
    const result = resolveIdentity(wallet, null);

    expect(result.created).toBe(true);
    expect(result.linked).toBe(false);

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(result.userId) as {
      email: string | null;
    };
    expect(user.email).toBeNull();
  });

  it('signs into the existing account when the identity is known', () => {
    const first = resolveIdentity(wallet, null);
    const second = resolveIdentity(wallet, null);

    expect(second.userId).toBe(first.userId);
    expect(second.created).toBe(false);
    expect(second.linked).toBe(false);
  });

  it('links a new identity to the signed-in account', () => {
    const existing = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice', email: 'alice@corp.com' },
      null
    );

    const result = resolveIdentity(wallet, existing.userId);

    expect(result.userId).toBe(existing.userId);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(false);
    expect(listIdentities(existing.userId)).toHaveLength(2);
  });

  it('is a no-op when the identity already belongs to the signed-in account', () => {
    const first = resolveIdentity(wallet, null);
    const again = resolveIdentity(wallet, first.userId);

    expect(again.userId).toBe(first.userId);
    expect(again.linked).toBe(false);
    expect(listIdentities(first.userId)).toHaveLength(1);
  });

  it('refuses to move an identity that belongs to another account', () => {
    const owner = resolveIdentity(wallet, null);
    const other = resolveIdentity({ provider: 'google', subject: 'google-sub-bob' }, null);

    expect(() => resolveIdentity(wallet, other.userId)).toThrow(/another account/i);

    // The identity must still belong to whoever had it first.
    expect(listIdentities(owner.userId)).toHaveLength(1);
    expect(listIdentities(other.userId)).toHaveLength(1);
  });

  it('records the wallet label and chain for display', () => {
    const { userId } = resolveIdentity(wallet, null);
    const [identity] = listIdentities(userId);

    expect(identity.label).toBe('MetaMask');
    expect(identity.chain_id).toBe('eip155:1');
  });

  it('stamps last_used_at on a repeat sign-in', () => {
    const { userId } = resolveIdentity(wallet, null);
    resolveIdentity(wallet, null);

    expect(listIdentities(userId)[0].last_used_at).not.toBeNull();
  });
});

describe('unlinkIdentity', () => {
  it('removes an identity when others remain', () => {
    const { userId } = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice', email: 'alice@corp.com' },
      null
    );
    resolveIdentity(wallet, userId);
    const walletIdentity = listIdentities(userId).find((i) => i.provider === 'eip155')!;

    unlinkIdentity(userId, walletIdentity.id);

    expect(listIdentities(userId)).toHaveLength(1);
  });

  it('refuses to remove the last remaining login method', () => {
    const { userId } = resolveIdentity(wallet, null);
    const [only] = listIdentities(userId);

    expect(() => unlinkIdentity(userId, only.id)).toThrow(/last/i);
    expect(listIdentities(userId)).toHaveLength(1);
  });

  it('refuses to remove an identity belonging to someone else', () => {
    const mine = resolveIdentity(wallet, null);
    const theirs = resolveIdentity({ provider: 'google', subject: 'google-sub-bob' }, null);
    resolveIdentity(
      { provider: 'solana', subject: 'SoLaNaAddress11111111111111111111111111111' },
      theirs.userId
    );
    const theirIdentity = listIdentities(theirs.userId)[0];

    expect(() => unlinkIdentity(mine.userId, theirIdentity.id)).toThrow();
    expect(listIdentities(theirs.userId)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-identities.test.ts`
Expected: FAIL — cannot resolve `#utils/auth/identities`.

- [ ] **Step 3: Write the module**

```ts
// server/utils/auth/identities.ts
import type { Provider } from './types';

export interface IdentityRow {
  id: number;
  user_id: number;
  provider: Provider;
  subject: string;
  chain_id: string | null;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ResolveInput {
  provider: Provider;
  /** Canonical: the OAuth sub, or an address already through canonicalize(). */
  subject: string;
  chainId?: string | null;
  label?: string | null;
  /** Used only when creating a brand new account. */
  displayName?: string;
  email?: string | null;
  avatar?: string;
}

export interface ResolveResult {
  userId: number;
  /** True when this call attached the identity to an existing account. */
  linked: boolean;
  /** True when this call created the account. */
  created: boolean;
}

/** A readable account name for a wallet-only user: 0x1111…1111 */
function shortenSubject(subject: string): string {
  return subject.length > 12 ? `${subject.slice(0, 6)}…${subject.slice(-4)}` : subject;
}

/**
 * Map a proven identity onto an account, creating or linking as needed.
 *
 * currentUserId is the signed-in account, or null. Passing it is what makes
 * connecting a second wallet link rather than fork a new account.
 *
 * Throws 409 rather than reassigning an identity that belongs to someone else —
 * silently moving it would hand one person's projects to another.
 */
export function resolveIdentity(input: ResolveInput, currentUserId: number | null): ResolveResult {
  const db = useDb();

  const run = db.transaction((): ResolveResult => {
    const existing = db
      .prepare('SELECT id, user_id FROM user_identities WHERE provider = ? AND subject = ?')
      .get(input.provider, input.subject) as { id: number; user_id: number } | undefined;

    if (existing) {
      if (currentUserId !== null && currentUserId !== existing.user_id) {
        throw createError({
          statusCode: 409,
          message: 'This login method is linked to another account. Sign out first.',
        });
      }

      db.prepare("UPDATE user_identities SET last_used_at = datetime('now') WHERE id = ?").run(
        existing.id
      );
      return { userId: existing.user_id, linked: false, created: false };
    }

    let userId = currentUserId;
    let created = false;

    if (userId === null) {
      const row = db
        .prepare('INSERT INTO users (email, name, avatar) VALUES (?, ?, ?) RETURNING id')
        .get(
          input.email ?? null,
          input.displayName || shortenSubject(input.subject),
          input.avatar ?? ''
        ) as { id: number };
      userId = row.id;
      created = true;
    }

    db.prepare(
      `INSERT INTO user_identities (user_id, provider, subject, chain_id, label, last_used_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(userId, input.provider, input.subject, input.chainId ?? null, input.label ?? null);

    // A Google sign-in is how an account gets an email; a wallet never supplies
    // one, so this only fills a gap and never clears an existing value.
    if (!created && input.email) {
      db.prepare('UPDATE users SET email = COALESCE(email, ?) WHERE id = ?').run(
        input.email,
        userId
      );
    }

    return { userId, linked: !created, created };
  });

  return run();
}

export function listIdentities(userId: number): IdentityRow[] {
  return useDb()
    .prepare('SELECT * FROM user_identities WHERE user_id = ? ORDER BY created_at, id')
    .all(userId) as IdentityRow[];
}

/**
 * Detach a login method, refusing to leave an account unreachable.
 */
export function unlinkIdentity(userId: number, identityId: number): void {
  const db = useDb();

  const identity = db
    .prepare('SELECT id, user_id FROM user_identities WHERE id = ?')
    .get(identityId) as { id: number; user_id: number } | undefined;

  if (!identity || identity.user_id !== userId) {
    throw createError({ statusCode: 404, message: 'Login method not found' });
  }

  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM user_identities WHERE user_id = ?')
    .get(userId) as { n: number };

  if (n <= 1) {
    throw createError({
      statusCode: 400,
      message: 'This is your last login method — you would not be able to sign in again.',
    });
  }

  db.prepare('DELETE FROM user_identities WHERE id = ?').run(identityId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/auth-identities.test.ts`
Expected: PASS — all ten cases.

- [ ] **Step 5: Refactor Google sign-in onto `resolveIdentity`**

Task 3 gave `server/api/auth/google.get.ts` an inline transaction because
`resolveIdentity` did not exist yet. It does now, and it is the single place
account creation and linking belong. Replace the whole `try` block body — from
`const db = useDb();` through the `setUserSession` call — with:

```ts
const session = await getUserSession(event);
const currentUserId = (session.user as { id: number } | undefined)?.id ?? null;

const { userId } = resolveIdentity(
  {
    provider: 'google',
    subject: String(user.sub),
    displayName: user.name ?? '',
    email: user.email ?? null,
    avatar: user.picture ?? '',
  },
  currentUserId
);

const row = useDb()
  .prepare('SELECT id, email, name, avatar FROM users WHERE id = ?')
  .get(userId) as { id: number; email: string | null; name: string; avatar: string };

await setUserSession(event, { user: row });
```

and add the import at the top of the file:

```ts
import { resolveIdentity } from '#utils/auth/identities';
```

Signing in with Google while already signed in with a wallet now links the two,
which is the behavior the account page in Task 16 depends on.

- [ ] **Step 6: Verify the build is still green**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/utils/auth/identities.ts server/api/auth/google.get.ts tests/auth-identities.test.ts
git commit -m "feat(auth): add identity resolution with account linking"
```

---

## Task 10: Membership by identity, and deletion of the wallet authz layer

**Files:**

- Modify: `server/utils/auth.ts`
- Modify: `server/api/projects/index.get.ts`, `server/api/projects/[slug]/members/index.get.ts`, `index.post.ts`, `[id].delete.ts`
- Delete: `middleware/wallet-auth.ts`
- Test: `tests/auth-membership.test.ts`

**Interfaces:**

- Consumes: `listIdentities` from Task 9.
- Produces: `isProjectMember(projectId, userId, email)`, updated `SessionUser` with `email: string | null`, updated `ProjectRow` without `owner_wallet_address`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/auth-membership.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isProjectMember } from '#utils/auth';
import { resolveIdentity } from '#utils/auth/identities';
import { createTestDb, destroyTestDbs } from './setup/db';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDbs();
});

function makeProject(ownerId: number): number {
  const row = db
    .prepare('INSERT INTO projects (owner_id, slug, name) VALUES (?, ?, ?) RETURNING id')
    .get(ownerId, `p-${ownerId}-${Date.now()}`, 'Project') as { id: number };
  return row.id;
}

describe('isProjectMember', () => {
  it('matches an email invite issued before the person ever signed in', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectId, 'later@corp.com');

    // They sign in for the first time, and the invite resolves.
    const invitee = resolveIdentity(
      { provider: 'google', subject: 'later', email: 'later@corp.com' },
      null
    );

    expect(isProjectMember(projectId, invitee.userId, 'later@corp.com')).toBe(true);
  });

  it('matches a wallet invite against a linked identity', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const address = '0x1111111111111111111111111111111111111111';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'eip155', ?)"
    ).run(projectId, address);

    const invitee = resolveIdentity({ provider: 'eip155', subject: address }, null);

    expect(isProjectMember(projectId, invitee.userId, null)).toBe(true);
  });

  it('matches a wallet invite for an account that linked the wallet second', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const address = 'SoLaNaAddress11111111111111111111111111111';
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'solana', ?)"
    ).run(projectId, address);

    const invitee = resolveIdentity({ provider: 'google', subject: 'invitee' }, null);
    resolveIdentity({ provider: 'solana', subject: address }, invitee.userId);

    expect(isProjectMember(projectId, invitee.userId, null)).toBe(true);
  });

  it('does not match a stranger', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    const stranger = resolveIdentity({ provider: 'google', subject: 'stranger' }, null);

    expect(isProjectMember(projectId, stranger.userId, 'stranger@corp.com')).toBe(false);
  });

  it('does not let a null email match an email invite', () => {
    // A wallet-only account has no email. SQL comparison against NULL must not
    // be allowed to match a row by accident.
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectId = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectId, 'someone@corp.com');

    const walletUser = resolveIdentity(
      { provider: 'eip155', subject: '0x2222222222222222222222222222222222222222' },
      null
    );

    expect(isProjectMember(projectId, walletUser.userId, null)).toBe(false);
  });

  it('scopes membership to the project it was granted on', () => {
    const owner = resolveIdentity({ provider: 'google', subject: 'owner' }, null);
    const projectA = makeProject(owner.userId);
    const projectB = makeProject(owner.userId);
    db.prepare(
      "INSERT INTO project_members (project_id, kind, identifier) VALUES (?, 'email', ?)"
    ).run(projectA, 'guest@corp.com');
    const guest = resolveIdentity(
      { provider: 'google', subject: 'guest', email: 'guest@corp.com' },
      null
    );

    expect(isProjectMember(projectA, guest.userId, 'guest@corp.com')).toBe(true);
    expect(isProjectMember(projectB, guest.userId, 'guest@corp.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/auth-membership.test.ts`
Expected: FAIL — `isProjectMember` still takes `(projectId, email)`.

- [ ] **Step 3: Rewrite the membership helpers**

In `server/utils/auth.ts`, replace `SessionUser`, `ProjectRow`'s wallet field, `isProjectMember`, and `requireProjectAccess`:

```ts
export interface SessionUser {
  id: number;
  /** Null for accounts that have only ever signed in with a wallet. */
  email: string | null;
  name: string;
  avatar: string;
}
```

Delete the `owner_wallet_address` field from `ProjectRow`.

```ts
/**
 * True when the account is a member of the project.
 *
 * A member row is either an email invite or a wallet invite, so an invitation
 * can be issued before that person has ever signed in. Email rows match the
 * account's email; wallet rows match any identity linked to the account. The
 * admin/owner is not stored as a member.
 *
 * A null email never matches: `identifier = NULL` is NULL, not true.
 */
export function isProjectMember(projectId: number, userId: number, email: string | null): boolean {
  return Boolean(
    useDb()
      .prepare(
        `SELECT 1 FROM project_members m
         WHERE m.project_id = @projectId
           AND ( (m.kind = 'email' AND m.identifier = @email)
                 OR EXISTS (SELECT 1 FROM user_identities i
                            WHERE i.user_id = @userId
                              AND i.provider = m.kind
                              AND i.subject = m.identifier) )
         LIMIT 1`
      )
      .get({
        projectId,
        userId,
        email: email ? normalizeEmail(email) : null,
      })
  );
}

export async function requireProjectAccess(
  event: H3Event
): Promise<{ user: SessionUser; project: ProjectRow; isAdmin: boolean }> {
  const user = await requireUser(event);
  const slug = getRouterParam(event, 'slug')!;
  const project = getProjectBySlug(slug);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });
  const isAdmin = project.owner_id === user.id;
  if (!isAdmin && !isProjectMember(project.id, user.id, user.email)) {
    throw createError({ statusCode: 403, message: 'You are not a member of this project' });
  }
  return { user, project, isAdmin };
}
```

- [ ] **Step 4: Update the project listing query**

In `server/api/projects/index.get.ts`, replace the `EXISTS` clause and parameters:

```ts
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return useDb()
    .prepare(
      `
      SELECT p.slug, p.name, p.description, p.accent_color, p.icon_url, p.font_family, p.bg_color, p.bg_subtle, p.text_color, p."text-muted", p.border_color, p.radius, p.updated_at,
             CASE WHEN p.owner_id = @id THEN 'admin' ELSE 'member' END AS role
      FROM projects p
      WHERE p.owner_id = @id
         OR EXISTS (
              SELECT 1 FROM project_members m
              WHERE m.project_id = p.id
                AND ( (m.kind = 'email' AND m.identifier = @email)
                      OR EXISTS (SELECT 1 FROM user_identities i
                                 WHERE i.user_id = @id
                                   AND i.provider = m.kind
                                   AND i.subject = m.identifier) )
            )
      ORDER BY p.updated_at DESC
    `
    )
    .all({ id: user.id, email: user.email ? normalizeEmail(user.email) : null });
});
```

- [ ] **Step 5: Update the member management endpoints**

`server/api/projects/[slug]/members/index.get.ts` keeps its existing
`{ admin, members }` response shape and its `requireProjectAccess` guard. The
dashboard Team panel (`pages/dashboard/[slug]/index.vue`) binds directly to
`team.admin.avatar` and `team.members[].pending`, so returning a bare array
would break that panel at runtime, and switching to `requireProjectAdmin` would
stop non-admin members from seeing the roster they can see today.

What changes is only that wallet invites now appear alongside email invites, and
that account info is joined through `user_identities` rather than by email
string:

```ts
// Team roster: the admin (project owner) first, then invited members.
export default defineEventHandler(async (event) => {
  const { project } = await requireProjectAccess(event);
  const db = useDb();

  const admin = db
    .prepare('SELECT email, name, avatar FROM users WHERE id = ?')
    .get(project.owner_id) as { email: string | null; name: string; avatar: string } | undefined;

  // A member may not have signed in yet — join their account when one exists.
  // Email invites match on users.email; wallet invites match through the
  // identity table, so a member who signed in with a wallet still resolves.
  const members = db
    .prepare(
      `
    SELECT m.id, m.kind, m.identifier, m.added_at, u.name, u.avatar
    FROM project_members m
    LEFT JOIN users u ON u.id = (
      CASE WHEN m.kind = 'email'
        THEN (SELECT id FROM users WHERE lower(email) = m.identifier)
        ELSE (SELECT user_id FROM user_identities i
              WHERE i.provider = m.kind AND i.subject = m.identifier)
      END
    )
    WHERE m.project_id = ?
    ORDER BY m.added_at, m.id
  `
    )
    .all(project.id) as {
    id: number;
    kind: string;
    identifier: string;
    added_at: string;
    name: string | null;
    avatar: string | null;
  }[];

  return {
    admin: {
      email: admin?.email ?? '',
      name: admin?.name ?? '',
      avatar: admin?.avatar ?? '',
      role: 'admin',
    },
    members: members.map((m) => ({
      id: m.id,
      kind: m.kind,
      // `email` is retained for the email case so the existing panel keeps
      // working; wallet rows put the address here for display.
      email: m.identifier,
      identifier: m.identifier,
      name: m.name ?? '',
      avatar: m.avatar ?? '',
      pending: m.name === null,
      role: 'member',
    })),
  };
});
```

Then teach the panel to render a wallet row. In `pages/dashboard/[slug]/index.vue`,
add `kind: string;` and `identifier: string;` to the `TeamMember` interface, and
in the member row replace the bare `member.email` display with a label that
shortens an address:

```ts
const KIND_LABELS: Record<string, string> = {
  email: '',
  eip155: 'Ethereum',
  solana: 'Solana',
  polkadot: 'Polkadot',
};

/** Emails render in full; addresses are unreadable at full length. */
function memberLabel(member: TeamMember): string {
  if (member.kind === 'email') return member.email;
  const a = member.identifier;
  const short = a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
  return `${KIND_LABELS[member.kind] ?? member.kind} ${short}`;
}
```

and use `memberLabel(member)` everywhere the row currently shows `member.email`.

Finally, expose invite-by-address in the panel. The POST endpoint accepts a
`kind`, but `addMember()` only ever sends `{ email }`, so wallet invites — the
whole point of keying membership by identity — would be reachable only through
the API. Add a kind selector beside the invite input:

```ts
const newMemberKind = ref<'email' | 'eip155' | 'solana' | 'polkadot'>('email');

async function addMember() {
  teamBusy.value = true;
  teamError.value = '';
  try {
    await $fetch(`/api/projects/${slug}/members`, {
      method: 'POST',
      body: { kind: newMemberKind.value, identifier: newMemberInput.value },
    });
    newMemberInput.value = '';
    await loadTeam();
  } catch (e: any) {
    teamError.value = e.data?.message ?? 'Failed to add member';
  } finally {
    teamBusy.value = false;
  }
}
```

Rename `newMemberEmail` to `newMemberInput`, bind a `<select>` to
`newMemberKind` with the four options, and switch the input's placeholder and
`type` on the selected kind (`type="email"` only for `email`, so a wallet
address is not rejected by browser validation).

Replace the body of `server/api/projects/[slug]/members/index.post.ts`:

```ts
import { getAdapter } from '#utils/auth/chains';
import { WALLET_PROVIDERS, type WalletProvider } from '#utils/auth/types';

export default defineEventHandler(async (event) => {
  // requireProjectAccess, not Admin: any member manages members in this product
  // ("Everyone below can edit this project and manage members" — the panel's own
  // copy), and that is what this endpoint enforced before this plan touched it.
  const { project } = await requireProjectAccess(event);
  const body = await readBody<{ kind?: string; identifier?: string; email?: string }>(event);

  // `email` stays accepted so an existing client keeps working.
  const kind = body.kind ?? 'email';
  const raw = body.identifier ?? body.email;

  if (!raw?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'An email address or wallet address is required',
    });
  }

  let identifier: string;
  if (kind === 'email') {
    identifier = normalizeEmail(raw);
    if (!identifier.includes('@')) {
      throw createError({ statusCode: 400, message: 'That is not a valid email address' });
    }
  } else if (WALLET_PROVIDERS.includes(kind as WalletProvider)) {
    // Canonicalize so an invite matches however the person encodes their
    // address when they sign in.
    identifier = getAdapter(kind).canonicalize(raw.trim());
  } else {
    throw createError({ statusCode: 400, message: `Unsupported member kind: ${kind}` });
  }

  try {
    useDb()
      .prepare('INSERT INTO project_members (project_id, kind, identifier) VALUES (?, ?, ?)')
      .run(project.id, kind, identifier);
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      throw createError({ statusCode: 409, message: 'That person is already a member' });
    }
    throw error;
  }

  return { ok: true, kind, identifier };
});
```

`[id].delete.ts` needs no change: it deletes by `id` and `project_id`, neither of which moved.

- [ ] **Step 6: Delete the wallet route middleware**

```bash
git rm middleware/wallet-auth.ts
```

`middleware/auth.ts` already guards on `loggedIn`, which a wallet session now satisfies.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/auth-membership.test.ts`
Expected: PASS — all six cases.

- [ ] **Step 8: Commit**

```bash
git add server/utils/auth.ts server/api/projects tests/auth-membership.test.ts
git commit -m "feat(auth): key project membership by identity and drop wallet authz layer"
```

---

## Task 11: Wallet login endpoints

**Files:**

- Modify: `server/api/auth/wallet/login-message.post.ts`, `server/api/auth/wallet/login.post.ts`
- Modify: `server/utils/nft-ownership.ts` (drop the `auth-wallet` import)
- Delete: `server/api/auth/wallet/get-nonce.post.ts`, `server/api/auth/wallet/logout.post.ts`

**Interfaces:**

- Consumes: `getAdapter`, `generateNonce`, `getAuthConfig`, `verifyLoginAttempt`, `resolveIdentity`.
- Produces: `POST /api/auth/wallet/login-message` `{ provider, address }` → `{ message }`; `POST /api/auth/wallet/login` `{ provider, message, signature, chainId? }` → `{ ok, user }`.

- [ ] **Step 1: Rewrite the message endpoint**

```ts
// server/api/auth/wallet/login-message.post.ts
import { getAdapter } from '#utils/auth/chains';
import { generateNonce, getAuthConfig } from '#utils/auth/verify';
import { WALLET_PROVIDERS, type StoredNonce, type WalletProvider } from '#utils/auth/types';
import { requireAuthRateLimit } from '#utils/ratelimit';

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login-message');

  const body = await readBody<{ provider?: string; address?: string; chainId?: number }>(event);

  if (!body.provider || !WALLET_PROVIDERS.includes(body.provider as WalletProvider)) {
    throw createError({ statusCode: 400, message: 'Missing or unsupported provider' });
  }
  if (!body.address) {
    throw createError({ statusCode: 400, message: 'Missing required field: address' });
  }

  const provider = body.provider as WalletProvider;
  const adapter = getAdapter(provider);

  // Rejects anything not well-formed for this ecosystem before it reaches the
  // login message or the database.
  const address = adapter.canonicalize(body.address);

  const { domain, uri, evmChainIds } = getAuthConfig();

  // Always issue a fresh challenge. Reusing one still sitting in the session
  // would let an old signature be replayed against a new login. Stored under
  // `secure` so it stays server-side only, and bound to the ecosystem and
  // account it was issued for.
  const nonce: StoredNonce = {
    value: generateNonce(),
    issuedAt: Date.now(),
    provider,
    address,
  };
  await setUserSession(event, { secure: { walletNonce: nonce } });

  const chainId =
    provider === 'eip155'
      ? evmChainIds.includes(Number(body.chainId))
        ? Number(body.chainId)
        : evmChainIds[0]
      : undefined;

  return {
    success: true,
    message: adapter.buildMessage({
      address,
      nonce: nonce.value,
      issuedAt: new Date().toISOString(),
      domain,
      uri,
      chainId,
    }),
  };
});
```

- [ ] **Step 2: Rewrite the login endpoint**

```ts
// server/api/auth/wallet/login.post.ts
import { verifyLoginAttempt } from '#utils/auth/verify';
import { resolveIdentity } from '#utils/auth/identities';
import { WALLET_PROVIDERS, type StoredNonce, type WalletProvider } from '#utils/auth/types';
import { requireAuthRateLimit } from '#utils/ratelimit';

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login');

  const body = await readBody<{
    provider?: string;
    message?: string;
    signature?: string;
    chainId?: string;
    label?: string;
  }>(event);

  if (!body.provider || !WALLET_PROVIDERS.includes(body.provider as WalletProvider)) {
    throw createError({ statusCode: 400, message: 'Missing or unsupported provider' });
  }
  if (!body.message || !body.signature) {
    throw createError({ statusCode: 400, message: 'Missing required field: message or signature' });
  }

  const provider = body.provider as WalletProvider;
  const session = await getUserSession(event);
  const storedNonce = (session.secure as { walletNonce?: StoredNonce } | undefined)?.walletNonce;

  // Single-use challenge: drop it before verifying, so a failed or replayed
  // attempt cannot be retried against the same nonce. replaceUserSession rather
  // than setUserSession, because the latter merges and would leave it in place.
  await replaceUserSession(event, {
    ...session,
    secure: { ...(session.secure as Record<string, unknown>), walletNonce: undefined },
  });

  const { success, address, reason } = await verifyLoginAttempt(
    provider,
    body.message,
    body.signature,
    storedNonce
  );

  if (!success) {
    throw createError({ statusCode: 401, message: reason || 'Invalid signature' });
  }

  // Link to the signed-in account when there is one; otherwise sign in or
  // create. resolveIdentity throws 409 if the wallet belongs to someone else.
  const currentUserId = (session.user as { id: number } | undefined)?.id ?? null;

  const { userId } = resolveIdentity(
    {
      provider,
      // The address the server recovered or verified — never a body field.
      subject: address,
      chainId: typeof body.chainId === 'string' ? body.chainId : null,
      label: typeof body.label === 'string' ? body.label.slice(0, 64) : null,
    },
    currentUserId
  );

  const user = useDb()
    .prepare('SELECT id, email, name, avatar FROM users WHERE id = ?')
    .get(userId) as { id: number; email: string | null; name: string; avatar: string };

  await setUserSession(event, { user });

  return { ok: true, user };
});
```

- [ ] **Step 3: Delete the superseded endpoints**

```bash
git rm server/api/auth/wallet/get-nonce.post.ts server/api/auth/wallet/logout.post.ts
git rm server/utils/auth-wallet.ts
```

`server/api/auth/logout.post.ts` now covers both, because there is only one
session key.

`auth-wallet.ts` is deleted here rather than in Task 8 because the two endpoints
rewritten in Steps 1–2, plus `get-nonce.post.ts` deleted just above, were its
last importers. Removing it in the same commit keeps every task's build green.

- [ ] **Step 4: Fix the remaining import of the deleted module**

Find every file still importing the deleted module:

```bash
grep -rn "auth-wallet" server/ components/ pages/ composables/ middleware/ || true
```

For each hit, apply these substitutions:

| Old import                                                                                                                  | Replacement                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeAddress(addr)`                                                                                                    | `getAdapter('eip155').canonicalize(addr)` from `#utils/auth/chains`                                                              |
| `generateNonce`, `verifyLoginAttempt`                                                                                       | same names from `#utils/auth/verify`                                                                                             |
| `createLoginMessage`, `parseLoginMessage`, `verifyWalletSignature`                                                          | `getAdapter(provider).buildMessage` / `.parseMessage` / `.verify`                                                                |
| `getWeb3Config()`                                                                                                           | `getAuthConfig()` from `#utils/auth/verify` (`chainId` → `evmChainIds[0]`)                                                       |
| `upsertWalletUser(addr, chainId)`                                                                                           | `resolveIdentity({ provider: 'eip155', subject: addr }, null)` from `#utils/auth/identities`                                     |
| `requireWalletUser`, `requireWalletProjectAccess`, `requireWalletProjectAdmin`, `isWalletProjectMember`, `getSessionWallet` | `requireUser`, `requireProjectAccess`, `requireProjectAdmin`, `isProjectMember` from `#utils/auth` — these are now the only path |
| `SessionWalletUser`, `WalletUser` types                                                                                     | `SessionUser` from `#utils/auth`                                                                                                 |

**There are exactly four importers, and all four must be handled in this task —
otherwise deleting the module breaks the build.** Note that three of them use a
multi-line `import { … } from '#utils/auth-wallet'`, so a grep that filters for
lines containing the word `import` will miss them; grep for `auth-wallet` alone.

| Importer                                       | Handling                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/api/auth/wallet/get-nonce.post.ts`     | deleted in Step 3                                                                                                                                    |
| `server/api/auth/wallet/login-message.post.ts` | rewritten in Step 1                                                                                                                                  |
| `server/api/auth/wallet/login.post.ts`         | rewritten in Step 2                                                                                                                                  |
| `server/utils/nft-ownership.ts`                | **`import { upsertWalletUser } from './auth-wallet'`** — swap for `resolveIdentity({ provider: 'eip155', subject: addr }, null)` per the table above |

The `nft-ownership.ts` import did not exist when this plan was written; Task 4
added it while adapting that file to the unified schema. Its behavior is covered
indirectly by `tests/token-gating.test.ts`, which asserts on the
`user_identities` rows the call produces — run that file after the swap.

- [ ] **Step 5: Verify the whole suite passes and the app builds**

Run: `npm test`
Expected: PASS across all files.

Run: `npm run typecheck`
Expected: no errors. `server/api/auth/google.get.ts` from Task 3 now resolves, because `resolveIdentity` exists.

- [ ] **Step 6: Commit**

```bash
git add server/api/auth server/utils/nft-ownership.ts
git commit -m "feat(auth): make wallet login endpoints provider-aware"
```

---

## Task 12: Account identity endpoints

**Files:**

- Create: `server/api/account/identities/index.get.ts`
- Create: `server/api/account/identities/[id].delete.ts`

**Interfaces:**

- Consumes: `requireUser`, `listIdentities`, `unlinkIdentity`.
- Produces: `GET /api/account/identities` → `{ identities: [{ id, provider, subject, chain_id, label, created_at, last_used_at }] }`; `DELETE /api/account/identities/:id` → `{ ok: true }`.

- [ ] **Step 1: Write the list endpoint**

```ts
// server/api/account/identities/index.get.ts
import { listIdentities } from '#utils/auth/identities';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  return {
    identities: listIdentities(user.id).map((i) => ({
      id: i.id,
      provider: i.provider,
      subject: i.subject,
      chain_id: i.chain_id,
      label: i.label,
      created_at: i.created_at,
      last_used_at: i.last_used_at,
    })),
  };
});
```

- [ ] **Step 2: Write the unlink endpoint**

```ts
// server/api/account/identities/[id].delete.ts
import { unlinkIdentity } from '#utils/auth/identities';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);

  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, message: 'Invalid identity id' });
  }

  // Throws 404 when it is not theirs, 400 when it is their last one.
  unlinkIdentity(user.id, id);

  return { ok: true };
});
```

- [ ] **Step 3: Verify the suite still passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/api/account
git commit -m "feat(auth): add account identity list and unlink endpoints"
```

---

## Task 13: Client wallet connectors

**Files:**

- Create: `utils/wallets/types.ts`, `utils/wallets/eip155.ts`, `utils/wallets/solana.ts`, `utils/wallets/polkadot.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks (browser-side only).
- Produces: per module `discover(): Promise<DetectedWallet[]>` and `connectAndSign(wallet, address, message)`. Shared `DetectedWallet`, `WalletConnection`, `UserRejectedError`.

- [ ] **Step 1: Write the shared client types**

```ts
// utils/wallets/types.ts

/** A wallet extension found in this browser. */
export interface DetectedWallet {
  /** Stable per-ecosystem key, e.g. an EIP-6963 rdns or a wallet-standard name. */
  id: string;
  name: string;
  icon?: string;
}

export interface WalletConnection {
  address: string;
  /** CAIP-2 where the wallet reports it, e.g. 'eip155:8453'. */
  chainId?: string;
}

/**
 * The user closed the wallet prompt. Not an error condition — callers close the
 * modal quietly rather than showing a failure.
 */
export class UserRejectedError extends Error {
  constructor() {
    super('Signature request rejected');
    this.name = 'UserRejectedError';
  }
}

export interface WalletConnector {
  provider: 'eip155' | 'solana' | 'polkadot';
  label: string;
  installUrl: string;
  discover(): Promise<DetectedWallet[]>;
  connect(walletId: string): Promise<WalletConnection>;
  signMessage(walletId: string, address: string, message: string): Promise<string>;
}
```

- [ ] **Step 2: Write the EVM connector**

```ts
// utils/wallets/eip155.ts
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

const providers = new Map<string, Eip6963Detail>();

/**
 * EIP-6963 replaces the single window.ethereum slot that wallets used to fight
 * over: each extension announces itself, so every installed one is reachable.
 */
function listen(): void {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    providers.set(detail.info.rdns, detail);
  });
}

let listening = false;

export const eip155Connector: WalletConnector = {
  provider: 'eip155',
  label: 'Ethereum',
  installUrl: 'https://metamask.io/download/',

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];
    if (!listening) {
      listen();
      listening = true;
    }

    providers.clear();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // Announcements are synchronous in practice; one tick is enough to collect.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const found = [...providers.values()].map((p) => ({
      id: p.info.rdns,
      name: p.info.name,
      icon: p.info.icon,
    }));

    // Wallets predating EIP-6963 only expose the legacy injected object.
    if (!found.length && (window as any).ethereum) {
      return [{ id: 'injected', name: 'Browser wallet' }];
    }
    return found;
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const provider = resolveProvider(walletId);

    try {
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
      const chainIdHex: string = await provider.request({ method: 'eth_chainId' });

      return { address: accounts[0], chainId: `eip155:${parseInt(chainIdHex, 16)}` };
    } catch (error) {
      throw normalize(error);
    }
  },

  async signMessage(walletId: string, address: string, message: string): Promise<string> {
    const provider = resolveProvider(walletId);

    try {
      return await provider.request({ method: 'personal_sign', params: [message, address] });
    } catch (error) {
      throw normalize(error);
    }
  },
};

function resolveProvider(walletId: string): Eip1193Provider {
  const detail = providers.get(walletId);
  if (detail) return detail.provider;

  const injected = (window as any).ethereum as Eip1193Provider | undefined;
  if (injected) return injected;

  throw new Error('Wallet not available. Is the extension still installed?');
}

/** EIP-1193 reports a declined prompt as code 4001. */
function normalize(error: unknown): Error {
  if ((error as { code?: number })?.code === 4001) return new UserRejectedError();
  return error instanceof Error ? error : new Error(String(error));
}
```

- [ ] **Step 3: Write the Solana connector**

```ts
// utils/wallets/solana.ts
import { base58 } from '@scure/base';
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

interface SolanaWallet {
  name: string;
  icon?: string;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array } | Uint8Array>;
}

/**
 * Wallet Standard exposes registered wallets on window; Phantom, Solflare and
 * Backpack all register. The legacy window.solana object is the fallback.
 */
function installed(): Record<string, SolanaWallet> {
  const w = window as any;
  const found: Record<string, SolanaWallet> = {};

  if (w.phantom?.solana) found['phantom'] = { name: 'Phantom', ...w.phantom.solana };
  if (w.solflare) found['solflare'] = { name: 'Solflare', ...w.solflare };
  if (w.backpack) found['backpack'] = { name: 'Backpack', ...w.backpack };
  if (!Object.keys(found).length && w.solana)
    found['injected'] = { name: 'Solana wallet', ...w.solana };

  return found;
}

export const solanaConnector: WalletConnector = {
  provider: 'solana',
  label: 'Solana',
  installUrl: 'https://phantom.app/download',

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];
    return Object.entries(installed()).map(([id, w]) => ({ id, name: w.name, icon: w.icon }));
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const wallet = installed()[walletId];
    if (!wallet) throw new Error('Wallet not available. Is the extension still installed?');

    try {
      const { publicKey } = await wallet.connect();
      return { address: publicKey.toString() };
    } catch (error) {
      throw normalize(error);
    }
  },

  async signMessage(walletId: string, _address: string, message: string): Promise<string> {
    const wallet = installed()[walletId];
    if (!wallet) throw new Error('Wallet not available. Is the extension still installed?');

    try {
      const result = await wallet.signMessage(new TextEncoder().encode(message));
      // Wallets differ: some return the bytes, some wrap them.
      const signature = result instanceof Uint8Array ? result : result.signature;
      return base58.encode(signature);
    } catch (error) {
      throw normalize(error);
    }
  },
};

/** Solana wallets have no shared rejection code; they say so in the message. */
function normalize(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/reject|denied|cancel/i.test(message)) return new UserRejectedError();
  return error instanceof Error ? error : new Error(message);
}
```

- [ ] **Step 4: Write the Polkadot connector**

```ts
// utils/wallets/polkadot.ts
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

const APP_NAME = 'KnowledgeBook';

/**
 * @polkadot/extension-dapp is imported lazily: it touches window at module
 * scope, so a static import breaks server-side rendering.
 */
async function extensionDapp() {
  return await import('@polkadot/extension-dapp');
}

/** Accounts are keyed by address so a walletId round-trips through the UI. */
let accountCache: { address: string; name: string; source: string }[] = [];

export const polkadotConnector: WalletConnector = {
  provider: 'polkadot',
  label: 'Polkadot',
  installUrl: 'https://polkadot.js.org/extension/',

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];

    const { web3Enable, web3Accounts } = await extensionDapp();

    // Prompts the extension for authorization; returns [] when none installed.
    const extensions = await web3Enable(APP_NAME);
    if (!extensions.length) return [];

    const accounts = await web3Accounts();
    accountCache = accounts.map((a) => ({
      address: a.address,
      name: a.meta.name ?? a.address,
      source: a.meta.source,
    }));

    // One entry per account, since a Polkadot extension holds several.
    return accountCache.map((a) => ({ id: a.address, name: `${a.name} (${a.source})` }));
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const account = accountCache.find((a) => a.address === walletId);
    if (!account) throw new Error('Account not available. Try reconnecting the extension.');

    return { address: account.address };
  },

  async signMessage(walletId: string, address: string, message: string): Promise<string> {
    const account = accountCache.find((a) => a.address === walletId);
    if (!account) throw new Error('Account not available. Try reconnecting the extension.');

    try {
      const { web3FromSource } = await extensionDapp();
      const injector = await web3FromSource(account.source);

      if (!injector.signer.signRaw) {
        throw new Error('This wallet cannot sign plain messages.');
      }

      // type 'bytes' signs the payload as a message rather than a transaction.
      // The extension wraps it in <Bytes>…</Bytes>; the server's signatureVerify
      // accepts both wrapped and unwrapped forms.
      const { signature } = await injector.signer.signRaw({
        address,
        data: message,
        type: 'bytes',
      });

      return signature;
    } catch (error) {
      throw normalize(error);
    }
  },
};

/** The polkadot.js extension reports a closed prompt as "Cancelled". */
function normalize(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/cancel|reject/i.test(message)) return new UserRejectedError();
  return error instanceof Error ? error : new Error(message);
}
```

- [ ] **Step 5: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add utils/wallets
git commit -m "feat(auth): add browser wallet connectors for the three ecosystems"
```

---

## Task 14: Sign-in composable

**Files:**

- Create: `composables/useWalletAuth.ts`

**Interfaces:**

- Consumes: the three connectors from Task 13; the endpoints from Task 11.
- Produces: `useWalletAuth()` → `{ connectors, detected, discover, signIn, pending, error }`. `signIn(provider, walletId)` resolves once the session is established.

- [ ] **Step 1: Write the composable**

```ts
// composables/useWalletAuth.ts
import { eip155Connector } from '~/utils/wallets/eip155';
import { solanaConnector } from '~/utils/wallets/solana';
import { polkadotConnector } from '~/utils/wallets/polkadot';
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnector,
} from '~/utils/wallets/types';

const CONNECTORS: WalletConnector[] = [eip155Connector, solanaConnector, polkadotConnector];

/**
 * Drives the same four steps for every ecosystem — connect, fetch the message
 * the server composed, sign it, post it back — and leaves everything
 * chain-specific to the connectors.
 */
export function useWalletAuth() {
  const detected = ref<Record<string, DetectedWallet[]>>({});
  const pending = ref<string | null>(null);
  const error = ref<string | null>(null);
  const { fetch: refreshSession } = useUserSession();

  async function discover(provider: string): Promise<void> {
    const connector = CONNECTORS.find((c) => c.provider === provider);
    if (!connector) return;

    detected.value = { ...detected.value, [provider]: await connector.discover() };
  }

  async function discoverAll(): Promise<void> {
    await Promise.all(CONNECTORS.map((c) => discover(c.provider)));
  }

  async function signIn(provider: string, walletId: string): Promise<boolean> {
    const connector = CONNECTORS.find((c) => c.provider === provider);
    if (!connector) return false;

    pending.value = `${provider}:${walletId}`;
    error.value = null;

    try {
      const connection = await connector.connect(walletId);

      const signAndPost = async () => {
        const { message } = await $fetch<{ message: string }>('/api/auth/wallet/login-message', {
          method: 'POST',
          body: {
            provider,
            address: connection.address,
            chainId: connection.chainId ? Number(connection.chainId.split(':')[1]) : undefined,
          },
        });

        const signature = await connector.signMessage(walletId, connection.address, message);

        await $fetch('/api/auth/wallet/login', {
          method: 'POST',
          body: {
            provider,
            message,
            signature,
            chainId: connection.chainId,
            label: detected.value[provider]?.find((w) => w.id === walletId)?.name,
          },
        });
      };

      try {
        await signAndPost();
      } catch (e: any) {
        // A challenge that aged out between issue and signature is worth one
        // silent retry — the user did nothing wrong.
        if (/expired/i.test(e?.data?.message ?? e?.message ?? '')) {
          await signAndPost();
        } else {
          throw e;
        }
      }

      await refreshSession();
      return true;
    } catch (e: any) {
      // Declining the prompt is a choice, not a failure.
      if (e instanceof UserRejectedError) return false;

      error.value = e?.data?.message ?? e?.message ?? 'Wallet sign-in failed';
      return false;
    } finally {
      pending.value = null;
    }
  }

  return { connectors: CONNECTORS, detected, discover, discoverAll, signIn, pending, error };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add composables/useWalletAuth.ts
git commit -m "feat(auth): add useWalletAuth sign-in composable"
```

---

## Task 15: Sign-in UI

**Files:**

- Create: `components/auth/SignInPanel.vue`
- Rewrite: `components/wallet/WalletModal.vue`, `components/wallet/ConnectButton.vue`
- Modify: `pages/index.vue`

**Interfaces:**

- Consumes: `useWalletAuth` from Task 14.
- Produces: `<AuthSignInPanel />` (Nuxt auto-import name for `components/auth/SignInPanel.vue`).

- [ ] **Step 1: Write the sign-in panel**

```vue
<!-- components/auth/SignInPanel.vue -->
<script setup lang="ts">
const { connectors, detected, discoverAll, signIn, pending, error } = useWalletAuth();

const open = ref<string | null>(null);

onMounted(discoverAll);

async function choose(provider: string) {
  open.value = open.value === provider ? null : provider;
}

async function pick(provider: string, walletId: string) {
  if (await signIn(provider, walletId)) await navigateTo('/dashboard');
}
</script>

<template>
  <div class="signin">
    <a href="/api/auth/google" class="btn btn-primary btn-lg signin-google">
      Continue with Google
    </a>

    <div class="signin-divider"><span>or connect a wallet</span></div>

    <p v-if="error" class="signin-error">{{ error }}</p>

    <div class="signin-chains">
      <div v-for="connector in connectors" :key="connector.provider" class="signin-chain">
        <button class="signin-chain-btn" @click="choose(connector.provider)">
          <span>{{ connector.label }}</span>
          <span class="signin-count">
            {{ (detected[connector.provider] || []).length || 'none detected' }}
          </span>
        </button>

        <div v-if="open === connector.provider" class="signin-wallets">
          <button
            v-for="wallet in detected[connector.provider] || []"
            :key="wallet.id"
            class="signin-wallet"
            :disabled="pending !== null"
            @click="pick(connector.provider, wallet.id)"
          >
            <img v-if="wallet.icon" :src="wallet.icon" alt="" width="20" height="20" />
            <span>{{ wallet.name }}</span>
            <span v-if="pending === `${connector.provider}:${wallet.id}`">signing…</span>
          </button>

          <a
            v-if="!(detected[connector.provider] || []).length"
            :href="connector.installUrl"
            target="_blank"
            rel="noopener"
            class="signin-install"
          >
            Install a {{ connector.label }} wallet →
          </a>
        </div>
      </div>
    </div>

    <p class="signin-note">
      Wallet sign-in uses browser extensions, so it needs a desktop browser or your wallet’s
      built-in browser.
    </p>
  </div>
</template>

<style scoped>
.signin {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 380px;
  width: 100%;
}
.signin-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.signin-divider::before,
.signin-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.signin-error {
  color: #b42318;
  font-size: 13px;
  margin: 0;
}
.signin-chains {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.signin-chain-btn {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.signin-chain-btn:hover {
  background: var(--bg-subtle);
}
.signin-count {
  font-size: 12px;
  color: var(--text-muted);
}
.signin-wallets {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 0 8px;
}
.signin-wallet {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.signin-wallet:hover:not(:disabled) {
  background: var(--bg-subtle);
  border-color: var(--border);
}
.signin-wallet:disabled {
  opacity: 0.6;
  cursor: default;
}
.signin-install {
  font-size: 13px;
  color: var(--text-muted);
  padding: 8px 12px;
}
.signin-note {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
</style>
```

- [ ] **Step 2: Rewrite the two broken wallet components**

`components/wallet/WalletModal.vue` becomes a thin dialog around the panel:

```vue
<script setup lang="ts">
defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="isOpen" class="wallet-modal-overlay" @click.self="emit('close')">
    <div class="wallet-modal">
      <div class="wallet-modal-header">
        <h3>Sign in</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>
      <div class="wallet-modal-body">
        <AuthSignInPanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.wallet-modal {
  background: var(--bg);
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.wallet-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.wallet-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
.wallet-modal-body {
  padding: 20px;
}
</style>
```

`components/wallet/ConnectButton.vue` becomes a session-aware button:

```vue
<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession();
const showModal = ref(false);

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' });
  await clear();
  await navigateTo('/');
}
</script>

<template>
  <div>
    <button v-if="!loggedIn" class="btn btn-primary" @click="showModal = true">Sign in</button>
    <button v-else class="btn" @click="signOut">
      Sign out{{ user?.name ? ` (${user.name})` : '' }}
    </button>

    <WalletModal :is-open="showModal" @close="showModal = false" />
  </div>
</template>
```

- [ ] **Step 3: Put the panel on the landing page**

In `pages/index.vue`, replace the header `<nav>` block:

```vue
<nav>
        <NuxtLink v-if="loggedIn" to="/dashboard" class="btn btn-primary">Dashboard</NuxtLink>
        <a v-else href="#signin" class="btn btn-primary">Sign in</a>
      </nav>
```

Then replace the entire hero sign-in block — the `<a v-if="!loggedIn" href="/api/auth/google" class="btn btn-primary btn-lg">` element including its inline `<svg>`, through the closing `</NuxtLink>` of the `v-else` branch — with:

```vue
<AuthSignInPanel v-if="!loggedIn" id="signin" class="hero-signin" />
<NuxtLink v-else to="/dashboard" class="btn btn-primary btn-lg">
        Continue as {{ user?.name || user?.email }}
      </NuxtLink>
```

The `user` binding already exists in this file's `useUserSession()` destructure, so the script block needs no change. Add to the scoped styles:

```css
.hero-signin {
  margin: 0 auto;
  scroll-margin-top: 80px;
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/auth components/wallet pages/index.vue
git commit -m "feat(auth): add multi-chain sign-in panel and wire it into the landing page"
```

---

## Task 16: Account page

**Files:**

- Create: `pages/dashboard/account.vue`

**Interfaces:**

- Consumes: `GET`/`DELETE /api/account/identities` from Task 12; `useWalletAuth` from Task 14.
- Produces: the `/dashboard/account` route.

- [ ] **Step 1: Write the page**

```vue
<!-- pages/dashboard/account.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' });

interface Identity {
  id: number;
  provider: string;
  subject: string;
  chain_id: string | null;
  label: string | null;
}

const { data, refresh } = await useFetch<{ identities: Identity[] }>('/api/account/identities');
const { connectors, detected, discoverAll, signIn, pending } = useWalletAuth();
const message = ref<string | null>(null);

onMounted(discoverAll);

const LABELS: Record<string, string> = {
  google: 'Google',
  eip155: 'Ethereum',
  solana: 'Solana',
  polkadot: 'Polkadot',
};

/** 0x1111…1111 — full addresses are unreadable in a list. */
function shorten(subject: string): string {
  return subject.length > 16 ? `${subject.slice(0, 8)}…${subject.slice(-6)}` : subject;
}

async function link(provider: string, walletId: string) {
  message.value = null;
  // A session is already present, so the server links rather than creating.
  if (await signIn(provider, walletId)) await refresh();
}

async function unlink(id: number) {
  message.value = null;
  try {
    await $fetch(`/api/account/identities/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (e: any) {
    message.value = e?.data?.message ?? 'Could not remove that login method';
  }
}
</script>

<template>
  <div class="account">
    <h1>Login methods</h1>
    <p class="muted">Any of these signs you into the same account.</p>

    <p v-if="message" class="account-error">{{ message }}</p>

    <ul class="identity-list">
      <li v-for="identity in data?.identities || []" :key="identity.id">
        <div>
          <strong>{{ LABELS[identity.provider] || identity.provider }}</strong>
          <span class="muted">
            {{ identity.label ? `${identity.label} · ` : '' }}{{ shorten(identity.subject) }}
          </span>
        </div>
        <button
          class="btn btn-sm"
          :disabled="(data?.identities.length || 0) <= 1"
          :title="
            (data?.identities.length || 0) <= 1
              ? 'This is your only way to sign in'
              : 'Remove this login method'
          "
          @click="unlink(identity.id)"
        >
          Remove
        </button>
      </li>
    </ul>

    <h2>Link another wallet</h2>
    <div v-for="connector in connectors" :key="connector.provider" class="link-group">
      <span class="link-label">{{ connector.label }}</span>
      <button
        v-for="wallet in detected[connector.provider] || []"
        :key="wallet.id"
        class="btn btn-sm"
        :disabled="pending !== null"
        @click="link(connector.provider, wallet.id)"
      >
        {{ wallet.name }}
      </button>
      <a
        v-if="!(detected[connector.provider] || []).length"
        :href="connector.installUrl"
        target="_blank"
        rel="noopener"
        class="muted"
      >
        none detected — install →
      </a>
    </div>
  </div>
</template>

<style scoped>
.account {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 16px;
}
.account-error {
  color: #b42318;
  font-size: 14px;
}
.identity-list {
  list-style: none;
  padding: 0;
  margin: 16px 0 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.identity-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.identity-list .muted {
  display: block;
  font-size: 13px;
}
.link-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.link-label {
  min-width: 90px;
  font-weight: 500;
}
</style>
```

- [ ] **Step 2: Verify the whole suite and build pass**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/dashboard/account.vue
git commit -m "feat(auth): add account page for managing linked login methods"
```

---

## Task 17: Documentation and manual verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document the auth options**

In `README.md`, in the environment/configuration section, replace any mention of `NUXT_WEB3_CHAIN_ID` and add:

```markdown
### Authentication

Sign in with a Google account or a crypto wallet — Ethereum (MetaMask, Rabby,
Coinbase), Solana (Phantom, Solflare, Backpack) or Polkadot (Talisman, SubWallet,
polkadot.js). All of them resolve to one account: connect a wallet while signed
in and it links to the account you already have, manageable at
`/dashboard/account`.

Wallet sign-in uses browser extensions, so it requires a desktop browser or a
wallet's built-in browser. There is no WalletConnect/QR support.

| Variable                  | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `NUXT_WEB3_EVM_CHAIN_IDS` | Comma-separated EIP-155 chain ids accepted at sign-in            |
| `NUXT_WEB3_APP_DOMAIN`    | Domain bound into every login message and re-checked server-side |
| `NUXT_WEB3_APP_URI`       | URI bound into every login message                               |
```

- [ ] **Step 2: Manually verify one real wallet end to end**

Run: `npm run dev`

With at least one wallet extension installed, from `http://localhost:3000`:

1. Sign in with the wallet — you land on `/dashboard` with an account created.
2. Create a project, confirming a wallet-only account can own one.
3. Visit `/dashboard/account` — the wallet is listed, and Remove is disabled as the only method.
4. Link Google from that page, then confirm Remove becomes available.
5. Sign out, sign in with Google, and confirm you reach the same account and see the same project.

- [ ] **Step 3: Run the full suite one final time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document multi-chain wallet sign-in and its configuration"
```
