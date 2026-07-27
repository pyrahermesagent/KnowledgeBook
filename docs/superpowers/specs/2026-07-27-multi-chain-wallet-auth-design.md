# Multi-chain wallet authentication

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation planning

Add sign-in with Polkadot, Solana and Ethereum wallets alongside the existing
Google account login, on a single unified account model.

## Starting point

This is not a greenfield feature. An EVM-only wallet login already exists and is
half-wired:

- `server/utils/auth-wallet.ts` implements SIWE (EIP-4361) correctly — viem
  `recoverMessageAddress`, single-use nonce with a 10 minute TTL, `timingSafeEqual`
  nonce comparison, domain and chain re-checks, rate limiting.
- Endpoints exist under `server/api/auth/wallet/`.
- `components/wallet/ConnectButton.vue` and `WalletModal.vue` exist but **no page
  imports them**, so wallet login is unreachable from the UI. `WalletModal` offers
  Phantom and then connects through `window.ethereum`, which cannot work for
  Solana. `ConnectButton.checkConnection()` is an empty TODO.
- **A wallet user cannot use the app.** `projects.owner_id` is
  `NOT NULL REFERENCES users(id)` and both `/api/projects` GET and POST call
  `requireUser`, which reads the Google session only. Wallet sign-in yields a
  session and nothing else.
- The schema is EVM-shaped: `wallet_users.chain_id` is an `INTEGER`,
  `normalizeAddress()` lowercases, and `parseLoginMessage()` hardcodes
  `0x[a-fA-F0-9]{40}` and the literal string `Ethereum account`.
- Two parallel authorization silos exist: `project_members` (by email) versus
  `wallet_project_members` (by address), `requireProjectAccess` versus
  `requireWalletProjectAccess`.

There is also **no migration runner**. `migrations/*.sql` are dead files that
nothing reads. Schema lives in `initSchema()` using `CREATE TABLE IF NOT EXISTS`
plus `ensureColumn()`, which can only add columns.

## Decisions

| Decision             | Choice                                                               |
| -------------------- | -------------------------------------------------------------------- |
| Identity model       | One unified account, many login methods                              |
| Chain binding        | Ecosystem-wide; chain id is metadata, not identity                   |
| Wallet reach         | All browser extensions via discovery standards; no third-party relay |
| Membership           | `project_members` keyed by `(kind, identifier)`                      |
| Message format       | Per-ecosystem native standards                                       |
| Linking              | Auto-link when signed in, plus an account settings page              |
| `get-nonce` endpoint | Delete                                                               |

## Data model

### New table

```sql
CREATE TABLE user_identities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,   -- 'google' | 'eip155' | 'solana' | 'polkadot'
  subject      TEXT NOT NULL,   -- google sub, or canonical address
  chain_id     TEXT,            -- CAIP-2 last seen, e.g. 'eip155:8453'; display only
  label        TEXT,            -- wallet name, e.g. 'Talisman'
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  UNIQUE (provider, subject)
);
CREATE INDEX idx_user_identities_user ON user_identities (user_id);
```

`UNIQUE (provider, subject)` is the core security property: a wallet belongs to
exactly one account, enforced by the database rather than by a check that can
race.

### Canonical `subject` per provider

Getting this wrong silently corrupts identities, so it is specified exactly:

| Provider   | Canonical form                        | Trap avoided                                           |
| ---------- | ------------------------------------- | ------------------------------------------------------ |
| `eip155`   | `getAddress(a).toLowerCase()`         | none; current behavior                                 |
| `solana`   | base58 string, **case preserved**     | lowercasing yields a different key                     |
| `polkadot` | `encodeAddress(decodeAddress(a), 42)` | one key has a different SS58 string per network prefix |
| `google`   | the OAuth `sub` claim                 | email can change, `sub` cannot                         |

Verified against `@polkadot/util-crypto@14`: the same sr25519 key encoded under
prefixes 0 (Polkadot), 2 (Kusama) and 42 (generic) all decode to the same public
key and normalize to one identity.

### Changes to existing tables

- `users`: drop `google_id` (moves to `user_identities`); make `email`
  **nullable** — wallet-only users have none. SQLite cannot relax `NOT NULL` in
  place, so this needs a table rebuild (create new, copy, drop, rename) inside one
  transaction with `foreign_keys = OFF`.
- `project_members`: add `kind` and `identifier`. Existing rows become
  `kind = 'email'`. Rows from `wallet_project_members` migrate in as
  `kind = 'eip155'`. Then drop `wallet_project_members`.
- `projects.owner_wallet_address`: resolve to a real `owner_id` through
  `user_identities`, then drop the column. `owner_id` stays `NOT NULL` — every
  project has exactly one owning account, as today.
- `wallet_users`: backfill into `users` + `user_identities`, then drop.

Untouched: `user_encryption_access`, `encryption_keys`, `page_versions`,
`token_gated_projects`, `nft_project_ownership`.

### Migration mechanics

Add a `schema_version` table and an ordered list of migration steps in
`server/utils/db.ts`, each wrapped in a transaction, run once at boot.
`ensureColumn()` remains for trivial additive changes.

Ordered steps:

1. Create `user_identities`.
2. Backfill `('google', users.google_id)` for every user with a `google_id`.
3. For each `wallet_users` row, create a `users` row (`email` NULL, `name` set to
   the shortened address) plus an `('eip155', address)` identity.
4. Rebuild `users` without `google_id` and with `email` nullable.
5. Rebuild `project_members` as
   `(id, project_id, kind, identifier, role, added_at)` with
   `UNIQUE (project_id, kind, identifier)`. Copy existing rows as
   `kind = 'email', identifier = email`, dropping the old `email` column; copy
   every `wallet_project_members` row as `kind = 'eip155'`. Drop
   `wallet_project_members`.
6. Resolve `projects.owner_wallet_address` into `owner_id`; drop the column.
7. Drop `wallet_users`.

Steps 4 and 5 are table rebuilds. Both **preserve existing primary key values** by
copying `id` explicitly, because `user_identities.user_id`,
`projects.owner_id`, `user_encryption_access.user_id` and
`page_versions.author_id` all reference `users(id)`.

## Auth core

### The central invariant

EVM _recovers_ the signer from a signature. ed25519 (Solana) and sr25519
(Polkadot) can only _verify against a supplied public key_. Generalizing this
carelessly is where wallet logins get CVEs: if the verifying key comes from a
client-supplied `address` field, an attacker pairs any valid signature with their
own address.

> **The address is bound inside the signed message. Verification always uses the
> address parsed out of that message, never a separate request field.**

EVM recovers and compares against the parsed address (today's behavior,
preserved). Solana and Polkadot decode the parsed address into a public key and
verify against it. The only trusted output is `parsed.address`. The `address` in
the request body is used solely to build the message and is otherwise ignored.

### Adapter interface

`server/utils/auth/chains/{eip155,solana,polkadot}.ts`:

```ts
interface ChainAdapter {
  provider: 'eip155' | 'solana' | 'polkadot';
  canonicalize(address: string): string; // validate + normalize, else 400
  buildMessage(input: MessageInput): string; // native format per ecosystem
  parseMessage(message: string): ParsedMessage | null;
  verify(message: string, signature: string, address: string): Promise<boolean>;
}
```

Everything security-critical lives once in the shared core; only message format
and the signature primitive vary.

### Shared verifier

Ordered so the cheapest and most likely failures come first:

1. A challenge exists for this session.
2. It is within the 10 minute TTL.
3. `adapter.parseMessage(message)` succeeds.
4. `timingSafeEqual` on the nonce.
5. Domain matches configuration.
6. Chain allowlist check — **`eip155` only**. A SIWE message carries a numeric
   `Chain ID` field, and it is checked against the configured allowlist. Solana
   and Polkadot messages carry no numeric chain id, so this step is a no-op for
   them; their `chain_id` column is populated from what the client reports and is
   never trusted for authorization.
7. `adapter.verify(message, signature, parsed.address)`.

The challenge is dropped from the session _before_ verification, via
`replaceUserSession` — existing behavior, preserved, so a failed or replayed
attempt cannot reuse it.

**Hardening:** the stored nonce becomes `{ value, issuedAt, provider, address }`
and login re-checks provider and address against it. Today the nonce is anonymous;
with three message formats, a challenge issued for a Solana login could otherwise
be spent on an EVM message.

### Per-ecosystem specifics

|          | Message standard                                      | Signature primitive                            | Encoding |
| -------- | ----------------------------------------------------- | ---------------------------------------------- | -------- |
| Ethereum | SIWE / EIP-4361 (existing builder survives)           | viem `recoverMessageAddress`                   | hex      |
| Solana   | SIWS-format text, signed via `signMessage`            | `@noble/curves` ed25519 + `@scure/base` base58 | base58   |
| Polkadot | Plain-text KnowledgeBook message (no standard exists) | `@polkadot/util-crypto` `signatureVerify`      | hex      |

All three are signed as **plain text via each wallet's message-signing call**.
The Wallet Standard `signIn` method (the structured SIWS flow) is deliberately
**not** used: extension support for it is uneven, and it returns a wallet-composed
message that the server would have to re-derive and re-validate. Emitting SIWS
_format_ and signing it with `signMessage` keeps the server the sole author of
every message it later parses, which is what the central invariant depends on.

Message formats — each server-generated, and re-parsed by the same adapter:

```
SIWE (eip155), unchanged from today:
  {domain} wants you to sign in with your Ethereum account:

  {checksummedAddress}

  {statement}
  URI: {uri}
  Chain ID: {chainId}
  Nonce: {nonce}
  Issued At: {issuedAt}

SIWS format (solana):
  {domain} wants you to sign in with your Solana account:

  {base58Address}

  {statement}
  URI: {uri}
  Version: 1
  Nonce: {nonce}
  Issued At: {issuedAt}

Polkadot:
  {domain} wants you to sign in with your Polkadot account:

  {ss58Address}

  {statement}
  URI: {uri}
  Nonce: {nonce}
  Issued At: {issuedAt}
```

The three parsers differ only in the header line and the address pattern —
`0x[a-fA-F0-9]{40}`, base58, and SS58 respectively. Each parser must reject an
address whose format belongs to a different ecosystem, so a message cannot be
routed to the wrong adapter.

**Binding constraint on the Polkadot adapter:** it must use the high-level
`signatureVerify`, never the low-level `sr25519Verify`. The polkadot.js extension
wraps payloads in `<Bytes>…</Bytes>` before signing, deliberately, so a dApp
cannot trick a user into signing a transaction payload. `signatureVerify` handles
both wrapped and unwrapped forms transparently; `sr25519Verify` does not and fails
silently as "invalid signature". Verified:

```
sr25519Verify(rawMsg, extensionSig)   -> false
signatureVerify(rawMsg, extensionSig) -> true
```

A regression test pins this so a future refactor to the primitive cannot pass.

`cryptoWaitReady()` (WASM init) must be awaited once before any Polkadot
verification.

### Identity resolution

One transaction, with `UNIQUE (provider, subject)` as the backstop against
concurrent double-linking:

| Identity known? | Session?       | Result                                                |
| --------------- | -------------- | ----------------------------------------------------- |
| yes             | none           | sign in as that user                                  |
| yes             | same user      | refresh `last_used_at`                                |
| yes             | different user | **409** — "linked to another account, sign out first" |
| no              | yes            | link to current account                               |
| no              | none           | create account + identity                             |

### Session and code removal

A wallet login populates the **same `session.user`** as Google. The entire
parallel wallet authorization layer is therefore deleted:

- `middleware/wallet-auth.ts`
- `requireWalletUser`, `requireWalletProjectAccess`, `requireWalletProjectAdmin`,
  `isWalletProjectMember`
- the `session.wallet` key
- `server/api/auth/wallet/get-nonce.post.ts`
- `server/api/auth/wallet/logout.post.ts` — with a single session key there is no
  longer a wallet to drop independently of the user, so the existing
  `server/api/auth/logout.post.ts` covers both

`middleware/auth.ts` and `requireProjectAccess` become the only paths, so every
existing endpoint gains wallet support without being modified. This feature should
remove more authorization code than it adds.

Membership check becomes one query. A NULL email never matches, which is correct
by construction:

```sql
WHERE m.project_id = ?
  AND ( (m.kind = 'email' AND m.identifier = ?)          -- user's email, may be NULL
        OR EXISTS (SELECT 1 FROM user_identities i
                   WHERE i.user_id = ? AND i.provider = m.kind
                     AND i.subject = m.identifier) )
```

### Endpoints

- `POST /api/auth/wallet/login-message` — body `{ provider, address }`, returns
  `{ message }`.
- `POST /api/auth/wallet/login` — body `{ provider, message, signature }`,
  establishes the session.
- `POST /api/auth/logout` — clears the session.
- `GET /api/account/identities` — list linked login methods.
- `DELETE /api/account/identities/:id` — unlink; refuses the last one.

Linking a new wallet needs no dedicated endpoint: the account page drives the same
`login-message` + `login` pair, and because a session is present, identity
resolution links rather than creates.

### Configuration

`web3.chainId` (a single value with a strict-equality reject) becomes
`NUXT_WEB3_EVM_CHAIN_IDS`, a comma-separated allowlist. `appDomain` and `appUri`
are unchanged and still re-checked server-side.

## Client

`composables/useWalletAuth.ts` runs the same sequence for every ecosystem —
discover, connect, fetch message, sign, POST — delegating specifics to
`utils/wallets/{eip155,solana,polkadot}.ts`:

|          | Discovery                                                                   | Signing call                        | Signature encoding |
| -------- | --------------------------------------------------------------------------- | ----------------------------------- | ------------------ |
| Ethereum | EIP-6963 announce/request events, `window.ethereum` fallback                | `personal_sign`                     | hex                |
| Solana   | Wallet Standard registry (`@wallet-standard/app`)                           | `signMessage(Uint8Array)`           | base58             |
| Polkadot | `@polkadot/extension-dapp` `web3Enable` / `web3Accounts` / `web3FromSource` | `signer.signRaw({ type: 'bytes' })` | hex                |

EIP-6963 and Wallet Standard are discovery standards: any conforming extension
appears without being named, which is what makes broad wallet support achievable
without a hardcoded list.

### UI

- `components/auth/SignInPanel.vue` — Google button, divider, three ecosystem
  entries expanding to the wallets actually detected. Undetected wallets link to
  their install page rather than failing on click.
- `components/wallet/WalletModal.vue` and `ConnectButton.vue` are **rewritten**,
  not extended. Both are currently broken and neither is imported anywhere, so
  there are no consumers to break.
- `pages/index.vue` replaces its two hardcoded Google links with the panel.
- `pages/dashboard/account.vue` — new: linked login methods with add and remove,
  refusing removal of the last one.

### Reach limitation

Extension-based discovery covers desktop browsers and in-wallet mobile browsers. A
user on mobile Safari with the Phantom app installed cannot log in. This is the
consequence of declining WalletConnect, and the sign-in panel must say so rather
than appear broken.

## Error handling

| Condition                                                        | Handling                                     |
| ---------------------------------------------------------------- | -------------------------------------------- |
| User declines to sign (EVM code `4001`, ad-hoc throws elsewhere) | Treat as cancel: close modal, no error toast |
| No wallet installed                                              | Install link for that ecosystem              |
| Wallet locked                                                    | Prompt to unlock                             |
| Challenge expired                                                | Transparently refetch and retry **once**     |
| Wallet linked to another account                                 | 409 with sign-out instruction                |
| Removing last login method                                       | 400                                          |
| `cryptoWaitReady()` failure                                      | 503                                          |

`requireAuthRateLimit` continues to cover both auth endpoints.

## Testing

All three ecosystems can be tested with **real signatures from deterministic
seeds**, so no cryptography is mocked.

- **Per adapter:** canonicalization, message build/parse round-trip, valid
  signature, tampered message, signature from a different key, address/signature
  mismatch.
- **Pinned regressions for the traps identified:**
  - Solana canonicalization preserves case.
  - The same Polkadot key under prefixes 0, 2 and 42 resolves to one identity.
  - A `<Bytes>`-wrapped extension signature verifies (guards against a switch to
    `sr25519Verify`).
- **Shared core:** nonce single-use, TTL expiry, domain mismatch, chain outside
  allowlist, and cross-provider nonce replay rejected by the provider/address
  binding.
- **Identity resolution:** all five rows of the resolution table, including the 409.
- **Migration:** a seeded pre-migration database (Google user with projects,
  wallet user with projects, a shared project, a pending email invite) asserting
  no access is lost and none is gained.

## Dependencies

| Package                          | Side   | Purpose                                                         |
| -------------------------------- | ------ | --------------------------------------------------------------- |
| `@polkadot/util-crypto@^14`      | server | sr25519/ed25519 verification, SS58 encode/decode                |
| `@polkadot/extension-dapp@^0.63` | client | Polkadot extension discovery and signing                        |
| `@wallet-standard/app`           | client | Solana wallet discovery                                         |
| `@noble/curves`, `@scure/base`   | server | ed25519 + base58; promoted from transitive (via viem) to direct |

## Out of scope

- NFT ownership and token-gating remain EVM-only and untouched. That is
  authorization, not login.
- No WalletConnect or mobile relay support.
- No wallet-derived encryption keys.
