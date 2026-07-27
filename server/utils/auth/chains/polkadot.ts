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
