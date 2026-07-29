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

    // Distinguish "returned the existing user" from "created a second user":
    // the sign-in above must not have inserted a new users row.
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(n).toBe(1);
    expect(listIdentities(first.userId)).toHaveLength(1);
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
    // And it must not have moved: the wallet identity's owner is unchanged.
    const [ownerIdentity] = listIdentities(owner.userId);
    expect(ownerIdentity.subject).toBe(wallet.subject);
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

  it('stamps last_used_at on the very first sign-in too', () => {
    const { userId } = resolveIdentity(wallet, null);

    expect(listIdentities(userId)[0].last_used_at).not.toBeNull();
  });

  it('fills a missing email from a later Google sign-in without touching an existing one', () => {
    // Wallet-only account: email starts NULL.
    const { userId } = resolveIdentity(wallet, null);

    // Link Google — this should fill the email.
    resolveIdentity(
      { provider: 'google', subject: 'google-sub-carol', email: 'carol@corp.com' },
      userId
    );
    let user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as {
      email: string | null;
    };
    expect(user.email).toBe('carol@corp.com');

    // A second wallet, signing in already-linked, must NOT overwrite the
    // email even if it (hypothetically) supplied one.
    resolveIdentity(
      {
        provider: 'solana',
        subject: 'SoLaNaAddress11111111111111111111111111111',
        email: 'someone-else@corp.com',
      },
      userId
    );
    user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as {
      email: string | null;
    };
    expect(user.email).toBe('carol@corp.com');
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

  it('reports a 404, not a 403, for an identity belonging to someone else', () => {
    const mine = resolveIdentity(wallet, null);
    const theirs = resolveIdentity({ provider: 'google', subject: 'google-sub-bob' }, null);
    resolveIdentity(
      { provider: 'solana', subject: 'SoLaNaAddress11111111111111111111111111111' },
      theirs.userId
    );
    const theirIdentity = listIdentities(theirs.userId)[0];

    try {
      unlinkIdentity(mine.userId, theirIdentity.id);
      expect.unreachable('expected unlinkIdentity to throw');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
  });

  // The guard now rides on the DELETE statement itself rather than a separate
  // count read, so these pin that the two error codes still tell apart "not
  // yours / gone" from "your last one".
  it('reports a 404 for an identity id that does not exist at all', () => {
    const { userId } = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice', email: 'alice@corp.com' },
      null
    );
    resolveIdentity(wallet, userId);

    try {
      unlinkIdentity(userId, 987654);
      expect.unreachable('expected unlinkIdentity to throw');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(404);
    }
    expect(listIdentities(userId)).toHaveLength(2);
  });

  it('reports a 400, not a 404, for their own last login method', () => {
    const { userId } = resolveIdentity(wallet, null);
    const [only] = listIdentities(userId);

    try {
      unlinkIdentity(userId, only.id);
      expect.unreachable('expected unlinkIdentity to throw');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  it('removes only the requested identity, leaving the others reachable', () => {
    const { userId } = resolveIdentity(
      { provider: 'google', subject: 'google-sub-alice', email: 'alice@corp.com' },
      null
    );
    resolveIdentity(wallet, userId);
    resolveIdentity(
      { provider: 'polkadot', subject: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY' },
      userId
    );

    const walletIdentity = listIdentities(userId).find((i) => i.provider === 'eip155')!;
    unlinkIdentity(userId, walletIdentity.id);

    expect(
      listIdentities(userId)
        .map((i) => i.provider)
        .sort()
    ).toEqual(['google', 'polkadot']);
  });
});
