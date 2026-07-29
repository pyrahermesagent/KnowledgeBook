// tests/auth-verify.test.ts
import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import {
  cryptoWaitReady,
  sr25519PairFromSeed,
  sr25519Sign,
  encodeAddress,
} from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';
import { generateNonce, verifyLoginAttempt, getAuthConfig } from '#utils/auth/verify';
import { getAdapter } from '#utils/auth/chains';
import { NONCE_TTL_MS, type StoredNonce } from '#utils/auth/types';
import { setRuntimeConfig, TestHttpError } from './setup/nuxt-globals';

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

describe('getAdapter', () => {
  it('throws a 400 for an unsupported provider', () => {
    // A registry mis-wiring (e.g. a swapped adapter, or a lookup that returns
    // undefined) would not be caught by asserting only that *something*
    // throws — assert the actual status code createError was given.
    let caught: unknown;
    try {
      getAdapter('bogus');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TestHttpError);
    expect((caught as TestHttpError).statusCode).toBe(400);
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'throws a 400 for the inherited key %s',
    (provider) => {
      // A plain `ADAPTERS[provider]` lookup walks the prototype chain, so
      // getAdapter('constructor') returned Object — truthy, so it sailed past
      // the check and was handed back as if it were a chain adapter.
      let caught: unknown;
      try {
        getAdapter(provider);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(TestHttpError);
      expect((caught as TestHttpError).statusCode).toBe(400);
    }
  );
});

describe('getAuthConfig', () => {
  it('parses the EVM chain allowlist', () => {
    setRuntimeConfig({ web3: { evmChainIds: '1,8453', appDomain: DOMAIN, appUri: URI } });
    expect(getAuthConfig().evmChainIds).toEqual([1, 8453]);
  });

  it('falls back to [1] for an empty allowlist string', () => {
    setRuntimeConfig({ web3: { evmChainIds: '', appDomain: DOMAIN, appUri: URI } });
    expect(getAuthConfig().evmChainIds).toEqual([1]);
  });

  it('falls back to [1] when every entry is non-numeric junk', () => {
    setRuntimeConfig({ web3: { evmChainIds: 'abc,,def', appDomain: DOMAIN, appUri: URI } });
    expect(getAuthConfig().evmChainIds).toEqual([1]);
  });

  it('drops only the non-numeric entries when some are valid', () => {
    setRuntimeConfig({ web3: { evmChainIds: '1,abc,8453', appDomain: DOMAIN, appUri: URI } });
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
    // Narrow on purpose: this fixture's provider differs (solana vs eip155), so
    // the provider check at verify.ts must be the one that fires. A broader
    // regex here would also accept the reason produced by the address check
    // further down, letting this test stay green even if the provider check
    // were deleted (the address-format mismatch alone would still reject it).
    expect(result.reason).toMatch(/different ecosystem/i);
  });

  it('rejects cross-provider replay even when the address strings happen to coincide', async () => {
    // The previous test's address values differ in format (hex vs base58), so
    // the address-mismatch check alone would also reject it — that test could
    // pass even with the provider check deleted. This one pins the provider
    // check specifically: the stored challenge's address is (contrived) equal
    // to what the eip155 message canonicalizes to, so only a provider check
    // stops the replay.
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored({ provider: 'solana', address: ADDRESS });
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/different ecosystem/i);
  });

  it('rejects a challenge issued for a different address', async () => {
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored({ address: '0x2222222222222222222222222222222222222222' });
    const message = evmMessage(challenge.value);
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    // Narrow on purpose: this fixture's provider matches (eip155 both sides),
    // so the provider check passes and only the address check can fire.
    expect(result.reason).toMatch(/different account/i);
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

  it('rejects an empty-string message', async () => {
    const result = await verifyLoginAttempt('eip155', '', '0x00', stored());

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });

  it('rejects a message with a wrong-length nonce', async () => {
    // buildMessage does not validate its input, so an attacker-controlled
    // message could carry a nonce that is not the 64-hex-char shape the
    // adapters' parseMessage regexes require. This must fail cleanly rather
    // than throw when the nonce comparison runs.
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    const challenge = stored();
    const message = getAdapter('eip155').buildMessage({
      address: ADDRESS,
      nonce: 'short-nonce',
      issuedAt: new Date().toISOString(),
      domain: DOMAIN,
      uri: URI,
      chainId: 1,
    });
    const signature = await account.signMessage({ message });

    const result = await verifyLoginAttempt('eip155', message, signature, challenge);

    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });

  it('rejects an eip155 message whose address is well-formed only for another ecosystem', async () => {
    // A message hand-crafted to match the eip155 wire format but carrying a
    // Solana-shaped (base58) address in the address slot must fail to parse
    // rather than being accepted with a nonsense "address".
    const challenge = stored();
    const message = [
      `${DOMAIN} wants you to sign in with your Ethereum account:`,
      '',
      SOL_ADDRESS,
      '',
      'Please sign this message to confirm your identity.',
      `URI: ${URI}`,
      'Chain ID: 1',
      `Nonce: ${challenge.value}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join('\n');

    const result = await verifyLoginAttempt('eip155', message, '0x00', challenge);

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

  it('verifies a Polkadot attempt through the same core', async () => {
    // Exercises the registry end to end for the third ecosystem too: nothing
    // in tests/ elsewhere calls getAdapter('polkadot'), so without this a
    // registry mis-wiring (e.g. polkadot mapped to the wrong adapter) would
    // pass the full suite.
    setRuntimeConfig({ web3: { evmChainIds: '1', appDomain: DOMAIN, appUri: URI } });
    await cryptoWaitReady();
    const seed = new Uint8Array(32).fill(9);
    const pair = sr25519PairFromSeed(seed);
    const dotAddress = encodeAddress(pair.publicKey, 42);

    const challenge = stored({ provider: 'polkadot', address: dotAddress });
    const message = getAdapter('polkadot').buildMessage({
      address: dotAddress,
      nonce: challenge.value,
      issuedAt: new Date().toISOString(),
      domain: DOMAIN,
      uri: URI,
    });
    const signature = u8aToHex(sr25519Sign(new TextEncoder().encode(message), pair));

    const result = await verifyLoginAttempt('polkadot', message, signature, challenge);

    expect(result.success).toBe(true);
    expect(result.address).toBe(dotAddress);
  });
});
