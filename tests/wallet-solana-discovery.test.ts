// tests/wallet-solana-discovery.test.ts
//
// Two defects this file pins:
//
// 1. Discovery used to build its entries by spreading the injected provider
//    (`found['phantom'] = { name: 'Phantom', ...w.phantom.solana }`). A spread
//    copies only own enumerable properties, and injected wallets are class
//    instances whose connect/signMessage live on the prototype — so the copy
//    had `connect === undefined` and threw a TypeError on the first click. Even
//    where the methods were own properties, the copy severed `this` from the
//    real provider.
//
// 2. Discovery hardcoded Phantom/Solflare/Backpack, while the design chose the
//    Wallet Standard registry so "any conforming extension appears without
//    being named" — and `@wallet-standard/app` was a dependency nothing
//    imported.
//
// The fakes below are deliberately class instances with prototype methods that
// read `this`, which is exactly what a spread destroys.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { base58 } from '@scure/base';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import {
  solanaConnector,
  solanaStandardWallets,
  detectInjectedSolana,
  discoverSolanaWallets,
} from '../utils/wallets/solana';

const SIGNATURE_BYTES = new Uint8Array(64).fill(0).map((_, i) => i);
const ADDRESS = 'SoLaNaAddress11111111111111111111111111111';

/**
 * An injected wallet as extensions actually ship one: a class whose methods sit
 * on the prototype and depend on `this`.
 */
class FakeInjectedWallet {
  readonly icon = 'data:image/png;base64,AAAA';
  #address: string;
  lastSigned: Uint8Array | null = null;

  constructor(address: string) {
    this.#address = address;
  }

  async connect() {
    // Reading a private field is only possible with `this` bound to the real
    // instance — a detached or copied method throws here.
    return { publicKey: { toString: () => this.#address } };
  }

  async signMessage(message: Uint8Array) {
    this.lastSigned = message;
    return { signature: SIGNATURE_BYTES };
  }
}

/** A Wallet Standard wallet, likewise class-based with `this`-dependent features. */
class FakeStandardWallet {
  readonly version = '1.0.0' as const;
  readonly icon = 'data:image/svg+xml;base64,AAAA' as const;
  connectCalls = 0;
  lastSignedMessage: Uint8Array | null = null;

  constructor(
    readonly name: string,
    readonly chains: string[] = ['solana:mainnet'],
    private readonly withSignMessage = true
  ) {}

  get accounts() {
    return this.connectCalls
      ? [{ address: ADDRESS, publicKey: new Uint8Array(32), chains: this.chains, features: [] }]
      : [];
  }

  get features(): Record<string, unknown> {
    const features: Record<string, unknown> = {
      'standard:connect': {
        connect: async () => {
          this.connectCalls += 1; // needs `this`
          return { accounts: this.accounts };
        },
      },
    };
    if (this.withSignMessage) {
      features['solana:signMessage'] = {
        signMessage: async (...inputs: { message: Uint8Array }[]) => {
          this.lastSignedMessage = inputs[0]!.message; // needs `this`
          return [{ signature: SIGNATURE_BYTES }];
        },
      };
    }
    return features;
  }
}

const unregisters: (() => void)[] = [];

function registerWallet(wallet: unknown): void {
  unregisters.push(getWallets().register(wallet as Wallet));
}

function setWindow(value: Record<string, unknown> | undefined): void {
  (globalThis as Record<string, unknown>).window = value;
}

afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
  delete (globalThis as Record<string, unknown>).window;
});

describe('solanaStandardWallets', () => {
  it('keeps a wallet that supports a solana chain and solana:signMessage', () => {
    const wallet = new FakeStandardWallet('Conforming');
    expect(solanaStandardWallets([wallet as unknown as Wallet])).toHaveLength(1);
  });

  it('drops a wallet with no solana chain', () => {
    const wallet = new FakeStandardWallet('Ethereum Only', ['eip155:1']);
    expect(solanaStandardWallets([wallet as unknown as Wallet])).toHaveLength(0);
  });

  it('drops a solana wallet that cannot sign messages', () => {
    const wallet = new FakeStandardWallet('No Signing', ['solana:mainnet'], false);
    expect(solanaStandardWallets([wallet as unknown as Wallet])).toHaveLength(0);
  });
});

describe('detectInjectedSolana', () => {
  it('returns the real provider object, not a copy of it', () => {
    const phantom = new FakeInjectedWallet(ADDRESS);
    const found = detectInjectedSolana({ phantom: { solana: phantom } });

    expect(found).toHaveLength(1);
    // The load-bearing assertion: identity, not structural equality. A spread
    // would produce a different object here.
    expect(found[0]!.provider).toBe(phantom);
    expect(found[0]!.name).toBe('Phantom');
  });

  it('sees connect/signMessage that live on the prototype', () => {
    const phantom = new FakeInjectedWallet(ADDRESS);
    // Sanity: these really are prototype methods, so a spread would drop them.
    expect(Object.hasOwn(phantom, 'connect')).toBe(false);

    const found = detectInjectedSolana({ phantom: { solana: phantom } });
    expect(typeof found[0]!.provider.connect).toBe('function');
    expect(typeof found[0]!.provider.signMessage).toBe('function');
  });

  it('falls back to window.solana only when no named wallet matched', () => {
    const generic = new FakeInjectedWallet(ADDRESS);
    const named = new FakeInjectedWallet(ADDRESS);

    expect(detectInjectedSolana({ solana: generic })).toEqual([
      { id: 'injected:solana', name: 'Solana wallet', provider: generic },
    ]);

    const both = detectInjectedSolana({ solflare: named, solana: generic });
    expect(both.map((w) => w.name)).toEqual(['Solflare']);
  });

  it('ignores an object that cannot sign', () => {
    expect(detectInjectedSolana({ solflare: { name: 'not a wallet' } })).toEqual([]);
    expect(detectInjectedSolana({})).toEqual([]);
  });
});

describe('discoverSolanaWallets', () => {
  beforeEach(() => setWindow({}));

  it('surfaces a Wallet Standard wallet that was never named in our code', () => {
    registerWallet(new FakeStandardWallet('Some Brand New Wallet'));

    const found = discoverSolanaWallets();
    expect(found.map((w) => w.name)).toContain('Some Brand New Wallet');
    expect(found.find((w) => w.name === 'Some Brand New Wallet')!.icon).toBe(
      'data:image/svg+xml;base64,AAAA'
    );
  });

  it('still reports a non-conforming injected wallet', () => {
    setWindow({ backpack: new FakeInjectedWallet(ADDRESS) });

    expect(discoverSolanaWallets().map((w) => w.name)).toContain('Backpack');
  });

  it('does not list a wallet twice when it both registers and injects', () => {
    registerWallet(new FakeStandardWallet('Phantom'));
    setWindow({ phantom: { solana: new FakeInjectedWallet(ADDRESS) } });

    expect(discoverSolanaWallets().filter((w) => w.name === 'Phantom')).toHaveLength(1);
  });
});

describe('solanaConnector against a Wallet Standard wallet', () => {
  beforeEach(() => setWindow({}));

  it('connects and signs through the registry with `this` intact', async () => {
    const wallet = new FakeStandardWallet('Registry Wallet');
    registerWallet(wallet);

    const connection = await solanaConnector.connect('Registry Wallet');
    expect(connection.address).toBe(ADDRESS);
    expect(wallet.connectCalls).toBe(1);

    const signature = await solanaConnector.signMessage('Registry Wallet', ADDRESS, 'hello');
    expect(base58.decode(signature)).toEqual(SIGNATURE_BYTES);
    // The feature method ran on the real wallet, so its own state was updated.
    expect(new TextDecoder().decode(wallet.lastSignedMessage!)).toBe('hello');
  });

  it('throws a recognisable error for a wallet id discovery never surfaced', async () => {
    await expect(solanaConnector.connect('Nothing Here')).rejects.toThrow(/not available/i);
  });
});

describe('solanaConnector against an injected wallet', () => {
  it('connects and signs on the original object rather than a copy', async () => {
    const phantom = new FakeInjectedWallet(ADDRESS);
    setWindow({ phantom: { solana: phantom } });

    // Before the fix this threw "wallet.connect is not a function": the spread
    // had left the prototype methods behind.
    const connection = await solanaConnector.connect('injected:phantom');
    expect(connection.address).toBe(ADDRESS);

    const signature = await solanaConnector.signMessage('injected:phantom', ADDRESS, 'hello');
    expect(base58.decode(signature)).toEqual(SIGNATURE_BYTES);
    expect(new TextDecoder().decode(phantom.lastSigned!)).toBe('hello');
  });

  it('normalizes a declined prompt into UserRejectedError', async () => {
    const provider = {
      async connect(): Promise<{ publicKey: { toString(): string } }> {
        throw new Error('User rejected the request.');
      },
      async signMessage() {
        return new Uint8Array();
      },
    };
    setWindow({ solflare: provider });

    await expect(solanaConnector.connect('injected:solflare')).rejects.toThrow(
      /Signature request rejected/
    );
  });
});
