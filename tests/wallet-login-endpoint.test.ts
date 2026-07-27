// tests/wallet-login-endpoint.test.ts
//
// Endpoint-level coverage for POST /api/auth/wallet/login-message and
// POST /api/auth/wallet/login, invoked as the real exported route handlers
// against a real SQLite database (same pattern as
// tests/project-members-endpoint.test.ts). tests/auth-verify.test.ts already
// covers verifyLoginAttempt's internals directly; these tests pin the HTTP
// seam: request validation, the session hand-off between the two endpoints,
// and — the contract called out in the task brief — that login-message
// stores the *canonicalized* address in the session challenge, not whatever
// casing the client posted. verify.ts compares the two with a raw `!==`
// (server/utils/auth/verify.ts:88) and never re-canonicalizes the stored
// side, so storing the raw form fails every login for that address closed.
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { createEvent } from 'h3';
import type { H3Event } from 'h3';
import { privateKeyToAccount } from 'viem/accounts';
import loginMessageHandler from '#server/api/auth/wallet/login-message.post';
import loginHandler from '#server/api/auth/wallet/login.post';
import { resolveIdentity } from '#utils/auth/identities';
import { resetRateLimit } from '#utils/ratelimit';
import { createTestDb, destroyTestDbs } from './setup/db';

const globals = globalThis as Record<string, unknown>;

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PRIVATE_KEY);
// viem checksums Account#address by default (EIP-55) — this is a genuinely
// mixed-case string, not a contrived one.
const CHECKSUMMED_ADDRESS = account.address;
const CANONICAL_ADDRESS = CHECKSUMMED_ADDRESS.toLowerCase();

/**
 * In-memory stand-in for the nuxt-auth-utils session the two endpoints share
 * across a login's two requests. Mirrors the real module's semantics
 * (node_modules/nuxt-auth-utils/dist/runtime/server/utils/session.js):
 * setUserSession merges (defu) into the existing session, replaceUserSession
 * clears and replaces wholesale. Both endpoints under test only ever nest one
 * level deep (`secure`), so a one-level merge is faithful here.
 */
let sessionData: Record<string, unknown> = {};

function installSessionGlobals(): void {
  globals.getUserSession = async () => ({ ...sessionData });
  globals.setUserSession = async (_event: unknown, data: Record<string, unknown>) => {
    sessionData = {
      ...sessionData,
      ...data,
      secure: {
        ...((sessionData.secure as Record<string, unknown>) ?? {}),
        ...((data.secure as Record<string, unknown>) ?? {}),
      },
    };
    return sessionData;
  };
  globals.replaceUserSession = async (_event: unknown, data: Record<string, unknown>) => {
    sessionData = { ...data };
    return sessionData;
  };
}

globals.readBody = async (event: { _body?: unknown }) => event._body ?? {};

/** Minimal node req/res pair good enough for h3 to build an event from. */
function createTestEvent(body: unknown): H3Event {
  const req = Object.assign(new EventEmitter(), {
    method: 'POST',
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
  // readBody is stubbed above to read this instead of parsing a real stream.
  (event as unknown as { _body: unknown })._body = body;
  return event;
}

/** Runs login-message then login for the fixture account; returns both results. */
async function loginAsFixtureAccount(address = CHECKSUMMED_ADDRESS): Promise<{
  messageResult: { success: boolean; message: string };
  loginResult: {
    ok: boolean;
    user: { id: number; email: string | null; name: string; avatar: string };
  };
}> {
  const messageResult = (await loginMessageHandler(
    createTestEvent({ provider: 'eip155', address })
  )) as { success: boolean; message: string };

  const signature = await account.signMessage({ message: messageResult.message });

  const loginResult = (await loginHandler(
    createTestEvent({ provider: 'eip155', message: messageResult.message, signature })
  )) as { ok: boolean; user: { id: number; email: string | null; name: string; avatar: string } };

  return { messageResult, loginResult };
}

let db: ReturnType<typeof createTestDb>;

describe('POST /api/auth/wallet/login-message + POST /api/auth/wallet/login', () => {
  beforeEach(() => {
    db = createTestDb();
    sessionData = {};
    installSessionGlobals();
    // The rate limiter buckets on (scope, IP) in a module-level Map that
    // persists across tests; the test harness's getRequestIP stub always
    // reports 127.0.0.1, so each test starts with a full bucket.
    resetRateLimit('auth:login-message:127.0.0.1');
    resetRateLimit('auth:login:127.0.0.1');
  });

  afterEach(() => {
    delete globals.getUserSession;
    delete globals.setUserSession;
    delete globals.replaceUserSession;
  });

  afterAll(() => {
    destroyTestDbs();
  });

  it('completes a full eip155 login end to end and binds the session to the canonical address', async () => {
    const { messageResult, loginResult } = await loginAsFixtureAccount();

    expect(messageResult.success).toBe(true);
    expect(loginResult.ok).toBe(true);
    expect(loginResult.user.id).toBeTypeOf('number');

    // The session the endpoint set is bound to the canonical (lowercased)
    // address the server verified, never the checksummed one that was posted.
    const identity = db
      .prepare("SELECT user_id, subject FROM user_identities WHERE provider = 'eip155'")
      .get() as { user_id: number; subject: string } | undefined;
    expect(identity?.subject).toBe(CANONICAL_ADDRESS);
    expect(identity?.user_id).toBe(loginResult.user.id);

    // setUserSession(event, { user }) landed on the shared session.
    expect(sessionData.user).toMatchObject({ id: loginResult.user.id });
  });

  it('is single-use: replaying the same message+signature after a successful login fails', async () => {
    const { messageResult, loginResult } = await loginAsFixtureAccount();
    expect(loginResult.ok).toBe(true);

    const signature = await account.signMessage({ message: messageResult.message });

    await expect(
      loginHandler(
        createTestEvent({ provider: 'eip155', message: messageResult.message, signature })
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('stores the canonicalized address, so a checksummed address login succeeds end to end', async () => {
    // Sanity: genuinely mixed-case EIP-55, not a contrived string — if this
    // fixture ever stopped being mixed-case the test below would pass
    // vacuously regardless of whether canonicalization happened.
    expect(CHECKSUMMED_ADDRESS).not.toBe(CHECKSUMMED_ADDRESS.toLowerCase());

    const { loginResult } = await loginAsFixtureAccount(CHECKSUMMED_ADDRESS);

    // If login-message stored body.address verbatim instead of the
    // canonicalized form, verify.ts's raw `storedNonce.address !== canonical`
    // check (server/utils/auth/verify.ts:88) would reject this as "issued for
    // a different account" and loginHandler would throw before returning ok.
    expect(loginResult.ok).toBe(true);
    expect(loginResult.user.id).toBeTypeOf('number');
  });

  it('rejects an unsupported provider with 400 on both endpoints', async () => {
    await expect(
      loginMessageHandler(createTestEvent({ provider: 'bogus', address: CHECKSUMMED_ADDRESS }))
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      loginHandler(createTestEvent({ provider: 'bogus', message: 'x', signature: '0x00' }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects login-message with a missing address with 400', async () => {
    await expect(
      loginMessageHandler(createTestEvent({ provider: 'eip155' }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects login with a missing message or signature with 400', async () => {
    await expect(
      loginHandler(createTestEvent({ provider: 'eip155', signature: '0x00' }))
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      loginHandler(createTestEvent({ provider: 'eip155', message: 'x' }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('propagates a 409 when the recovered wallet is already linked to a different account', async () => {
    // Wallet already belongs to account Y.
    const other = resolveIdentity(
      { provider: 'google', subject: 'wallet-owner', email: 'owner@corp.com' },
      null
    );
    resolveIdentity({ provider: 'eip155', subject: CANONICAL_ADDRESS }, other.userId);

    // A different account, X, is signed in and attempts to log in with the
    // same wallet.
    const signedIn = resolveIdentity(
      { provider: 'google', subject: 'signed-in-user', email: 'signedin@corp.com' },
      null
    );
    sessionData = {
      user: { id: signedIn.userId, email: 'signedin@corp.com', name: '', avatar: '' },
    };

    const messageResult = (await loginMessageHandler(
      createTestEvent({ provider: 'eip155', address: CHECKSUMMED_ADDRESS })
    )) as { message: string };
    const signature = await account.signMessage({ message: messageResult.message });

    await expect(
      loginHandler(
        createTestEvent({ provider: 'eip155', message: messageResult.message, signature })
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
