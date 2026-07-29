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
