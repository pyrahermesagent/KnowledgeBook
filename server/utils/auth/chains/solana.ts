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
