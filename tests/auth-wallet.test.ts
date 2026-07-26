import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createLoginMessage,
  generateNonce,
  parseLoginMessage,
  verifyWalletSignature,
  verifyLoginAttempt,
  normalizeAddress,
  upsertWalletUser,
  isWalletProjectMember,
  NONCE_TTL_MS,
  type StoredNonce,
} from '#utils/auth-wallet';
import { createTestDb, destroyTestDbs } from './setup/db';

// Deterministic test key — never used outside these tests.
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PRIVATE_KEY);
const ADDRESS = account.address.toLowerCase();

function freshNonce(): StoredNonce {
  return { value: generateNonce(), issuedAt: Date.now() };
}

describe('generateNonce', () => {
  it('produces a 64-char hex string', () => {
    expect(generateNonce()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not repeat', () => {
    const nonces = new Set(Array.from({ length: 100 }, generateNonce));
    expect(nonces.size).toBe(100);
  });
});

describe('normalizeAddress', () => {
  it('lowercases a checksummed address', () => {
    expect(normalizeAddress(account.address)).toBe(ADDRESS);
  });

  it('rejects a non-address', () => {
    expect(() => normalizeAddress('nope')).toThrow();
    expect(() => normalizeAddress('0x123')).toThrow();
  });
});

describe('parseLoginMessage', () => {
  /**
   * EIP-4361 specifies the address field as EIP-55 checksummed. SIWE clients
   * that validate the message they are asked to sign reject a lowercased one,
   * even though this server's own parser and signature check ignore casing.
   */
  it('writes an EIP-55 checksummed address into the message', () => {
    const message = createLoginMessage(ADDRESS, generateNonce());
    expect(message).toContain(account.address);
    expect(message).not.toContain(ADDRESS);
  });

  it('accepts a checksummed address back through the full login path', async () => {
    const stored: StoredNonce = { value: generateNonce(), issuedAt: Date.now() };
    const message = createLoginMessage(ADDRESS, stored.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(true);
    expect(result.address).toBe(ADDRESS);
  });

  it('round-trips the fields written by createLoginMessage', () => {
    const nonce = generateNonce();
    const parsed = parseLoginMessage(createLoginMessage(ADDRESS, nonce));

    expect(parsed).not.toBeNull();
    expect(parsed!.nonce).toBe(nonce);
    expect(parsed!.address.toLowerCase()).toBe(ADDRESS);
    expect(parsed!.chainId).toBe(1);
    expect(parsed!.domain).toBe('test.knowledgebook.app');
  });

  it('returns null for a message that is not ours', () => {
    expect(parseLoginMessage('please sign this, trust me')).toBeNull();
  });
});

describe('verifyWalletSignature', () => {
  it('recovers the signing address', async () => {
    const message = createLoginMessage(ADDRESS, generateNonce());
    const signature = await account.signMessage({ message });

    const result = await verifyWalletSignature(message, signature);

    expect(result.success).toBe(true);
    expect(result.address).toBe(ADDRESS);
  });

  it('does not recover the signer when the message was altered', async () => {
    const message = createLoginMessage(ADDRESS, generateNonce());
    const signature = await account.signMessage({ message });

    const result = await verifyWalletSignature(message + ' tampered', signature);

    // Recovery still succeeds arithmetically but yields a different address.
    expect(result.address).not.toBe(ADDRESS);
  });

  it('fails cleanly on a malformed signature', async () => {
    const result = await verifyWalletSignature('hello', '0xnotasignature');

    expect(result.success).toBe(false);
    expect(result.address).toBe('');
  });
});

describe('verifyLoginAttempt', () => {
  it('accepts a correctly signed, fresh challenge', async () => {
    const stored = freshNonce();
    const message = createLoginMessage(ADDRESS, stored.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(true);
    expect(result.address).toBe(ADDRESS);
  });

  it('rejects when the session issued no challenge', async () => {
    const message = createLoginMessage(ADDRESS, generateNonce());
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, undefined);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/No login challenge/);
  });

  it('rejects a signature bound to a different nonce (replay)', async () => {
    // Signature captured against an earlier challenge...
    const oldNonce = freshNonce();
    const oldMessage = createLoginMessage(ADDRESS, oldNonce.value);
    const oldSignature = await account.signMessage({ message: oldMessage });

    // ...replayed after the session moved on to a new one.
    const result = await verifyLoginAttempt(oldMessage, oldSignature, freshNonce());

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/Invalid login challenge/);
  });

  it('rejects an expired challenge', async () => {
    const stale: StoredNonce = {
      value: generateNonce(),
      issuedAt: Date.now() - NONCE_TTL_MS - 1000,
    };
    const message = createLoginMessage(ADDRESS, stale.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stale);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/expired/);
  });

  it('rejects a message issued for another domain', async () => {
    const stored = freshNonce();
    const message = createLoginMessage(ADDRESS, stored.value).replace(
      'test.knowledgebook.app wants',
      'evil.example wants'
    );
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/different domain/);
  });

  it('rejects a message issued for another chain', async () => {
    const stored = freshNonce();
    const message = createLoginMessage(ADDRESS, stored.value).replace(
      'Chain ID: 1',
      'Chain ID: 137'
    );
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/different chain/);
  });

  it('rejects a signature from a wallet other than the one in the message', async () => {
    const stored = freshNonce();
    const other = privateKeyToAccount(
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'
    );
    // Message names ADDRESS, but a different key signs it.
    const message = createLoginMessage(ADDRESS, stored.value);
    const signature = await other.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  it('rejects a malformed message even with a valid signature', async () => {
    const stored = freshNonce();
    const message = 'sign in pls';
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt(message, signature, stored);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/Malformed/);
  });
});

describe('wallet persistence', () => {
  beforeEach(() => {
    createTestDb();
  });

  afterAll(() => destroyTestDbs());

  it('creates a wallet user once and returns the same id', () => {
    const first = upsertWalletUser(account.address, 1);
    const second = upsertWalletUser(account.address, 1);

    expect(second).toBe(first);
  });

  it('treats checksummed and lowercase addresses as the same wallet', () => {
    const fromChecksummed = upsertWalletUser(account.address, 1);
    const fromLowercase = upsertWalletUser(ADDRESS, 1);

    expect(fromLowercase).toBe(fromChecksummed);
  });

  it('reports non-members as not belonging to a project', () => {
    expect(isWalletProjectMember(1, ADDRESS)).toBe(false);
  });

  it('matches membership regardless of address casing', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO users (google_id, email) VALUES ('g1', 'a@b.c')").run();
    db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p', 'P')").run();
    db.prepare('INSERT INTO wallet_project_members (project_id, wallet_address) VALUES (?, ?)').run(
      1,
      ADDRESS
    );

    expect(isWalletProjectMember(1, account.address)).toBe(true);
  });
});
