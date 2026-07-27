// tests/account-identities-endpoint.test.ts
//
// Endpoint-level coverage for GET /api/account/identities and
// DELETE /api/account/identities/:id, invoked as the real exported route
// handlers against a real SQLite database (same pattern as
// tests/wallet-login-endpoint.test.ts and tests/project-members-endpoint.test.ts).
// tests/auth-identities.test.ts already covers listIdentities/unlinkIdentity's
// internals directly (including the last-identity 400 and cross-account 404
// rules); these tests pin the HTTP seam instead: that the list endpoint only
// ever returns the signed-in user's own rows, that both endpoints require a
// session, and that the endpoint's own input validation (the non-numeric :id
// guard) and its delegation to unlinkIdentity behave correctly end to end.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import identitiesGetHandler from '#server/api/account/identities/index.get';
import identityDeleteHandler from '#server/api/account/identities/[id].delete';
import { requireUser } from '#utils/auth';
import { resolveIdentity, listIdentities } from '#utils/auth/identities';
import { TestHttpError } from './setup/nuxt-globals';
import { createTestDb, destroyTestDbs } from './setup/db';

const globals = globalThis as Record<string, unknown>;

// The endpoint modules reference requireUser as a bare identifier — Nitro's
// build-time auto-import supplies it in the real app. Under plain vitest
// there is no build step, so it must be wired up as a global the same way
// tests/project-members-endpoint.test.ts does for requireProjectAccess.
globals.requireUser = requireUser;

let sessionUser: { id: number; email: string | null; name: string; avatar: string } | null = null;

// Stand-in for nuxt-auth-utils' requireUserSession, mirroring its real
// semantics (node_modules/nuxt-auth-utils/dist/runtime/server/utils/session.js):
// throws 401 when nobody is signed in, otherwise resolves { user }. Installed
// once at module scope (rather than per-test like the project-members tests
// do) specifically so the "no session" case is a controlled 401 instead of a
// bare ReferenceError from the auto-import being entirely absent.
globals.requireUserSession = async () => {
  if (!sessionUser) {
    throw new TestHttpError({ statusCode: 401, message: 'Unauthorized' });
  }
  return { user: sessionUser };
};

function sessionAs(userId: number, email: string | null = null): void {
  sessionUser = { id: userId, email, name: '', avatar: '' };
}

/** Minimal node req/res pair good enough for h3 to build an event from. */
function createTestEvent(params: Record<string, string> = {}): H3Event {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/',
    headers: {} as Record<string, string>,
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: false,
    setHeader: () => {},
    getHeader: () => undefined,
    getHeaders: () => ({}),
    removeHeader: () => {},
    writeHead: () => {},
    write: () => true,
    end: () => {},
  });
  const event = createEvent(req as never, res as never);
  // The test harness's getRouterParam stub (tests/setup/nuxt-globals.ts) reads
  // event.params directly rather than h3's real event.context.params.
  (event as unknown as { params: Record<string, string> }).params = params;
  return event;
}

let db: ReturnType<typeof createTestDb>;

describe('GET /api/account/identities', () => {
  beforeEach(() => {
    db = createTestDb();
    sessionUser = null;
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it("returns exactly the signed-in user's identities, with the documented field set, and excludes another user's identities", async () => {
    const alice = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice', email: 'alice@corp.com' },
      null
    );
    resolveIdentity(
      {
        provider: 'eip155',
        subject: '0x1111111111111111111111111111111111111111',
        chainId: 'eip155:1',
        label: 'MetaMask',
      },
      alice.userId
    );
    const bob = resolveIdentity({ provider: 'google', subject: 'google-sub-bob' }, null);

    sessionAs(alice.userId, 'alice@corp.com');
    const result = (await identitiesGetHandler(createTestEvent())) as {
      identities: {
        id: number;
        provider: string;
        subject: string;
        chain_id: string | null;
        label: string | null;
        created_at: string;
        last_used_at: string | null;
      }[];
    };

    expect(result.identities).toHaveLength(2);
    // Exact documented field set — no extra columns (e.g. user_id) leaked.
    expect(Object.keys(result.identities[0]).sort()).toEqual(
      ['chain_id', 'created_at', 'id', 'label', 'last_used_at', 'provider', 'subject'].sort()
    );

    const subjects = result.identities.map((i) => i.subject);
    expect(subjects).toContain('google-sub-alice');
    expect(subjects).toContain('0x1111111111111111111111111111111111111111');

    // Isolation: Bob's identity must never appear in Alice's list.
    const bobIdentity = listIdentities(bob.userId)[0];
    expect(result.identities.some((i) => i.id === bobIdentity.id)).toBe(false);
    expect(subjects).not.toContain('google-sub-bob');
  });

  it('requires a session and returns 401 when absent', async () => {
    await expect(identitiesGetHandler(createTestEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('DELETE /api/account/identities/:id', () => {
  beforeEach(() => {
    db = createTestDb();
    sessionUser = null;
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('removes an identity when others remain, and the row is actually gone from the database', async () => {
    const alice = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice2', email: 'alice2@corp.com' },
      null
    );
    resolveIdentity(
      { provider: 'eip155', subject: '0x2222222222222222222222222222222222222222' },
      alice.userId
    );
    const walletIdentity = listIdentities(alice.userId).find((i) => i.provider === 'eip155')!;

    sessionAs(alice.userId, 'alice2@corp.com');
    const result = (await identityDeleteHandler(
      createTestEvent({ id: String(walletIdentity.id) })
    )) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(listIdentities(alice.userId)).toHaveLength(1);

    const row = db.prepare('SELECT id FROM user_identities WHERE id = ?').get(walletIdentity.id) as
      { id: number } | undefined;
    expect(row).toBeUndefined();
  });

  it("returns 400 when it is the user's last login method, and the identity is still present afterwards", async () => {
    const solo = resolveIdentity({ provider: 'google', subject: 'google-sub-solo' }, null);
    const [only] = listIdentities(solo.userId);

    sessionAs(solo.userId);
    await expect(
      identityDeleteHandler(createTestEvent({ id: String(only.id) }))
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(listIdentities(solo.userId)).toHaveLength(1);
    const row = db.prepare('SELECT id FROM user_identities WHERE id = ?').get(only.id) as
      { id: number } | undefined;
    expect(row).toBeDefined();
  });

  it('returns 404 for an identity belonging to another account, and that identity is still present afterwards', async () => {
    const alice = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice3', email: 'alice3@corp.com' },
      null
    );
    resolveIdentity(
      { provider: 'eip155', subject: '0x3333333333333333333333333333333333333333' },
      alice.userId
    );
    const bob = resolveIdentity({ provider: 'google', subject: 'google-sub-bob3' }, null);
    const [bobIdentity] = listIdentities(bob.userId);

    sessionAs(alice.userId, 'alice3@corp.com');
    await expect(
      identityDeleteHandler(createTestEvent({ id: String(bobIdentity.id) }))
    ).rejects.toMatchObject({ statusCode: 404 });

    // Bob's identity must be untouched, both in count and by id.
    expect(listIdentities(bob.userId)).toHaveLength(1);
    const row = db.prepare('SELECT id FROM user_identities WHERE id = ?').get(bobIdentity.id) as
      { id: number } | undefined;
    expect(row).toBeDefined();
  });

  it('returns 400 for a non-numeric :id route param', async () => {
    const alice = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice4', email: 'alice4@corp.com' },
      null
    );
    resolveIdentity(
      { provider: 'eip155', subject: '0x4444444444444444444444444444444444444444' },
      alice.userId
    );

    sessionAs(alice.userId, 'alice4@corp.com');
    await expect(
      identityDeleteHandler(createTestEvent({ id: 'not-a-number' }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
