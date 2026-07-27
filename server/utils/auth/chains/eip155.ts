// server/utils/auth/chains/eip155.ts
import { recoverMessageAddress, isAddress, getAddress } from 'viem';
import type { ChainAdapter, MessageInput, ParsedMessage } from '../types';

const STATEMENT = 'Please sign this message to confirm your identity.';

/**
 * Sign-In with Ethereum (EIP-4361).
 *
 * EVM is the one ecosystem where the signer can be recovered from the
 * signature, so verify() recovers and compares rather than checking against a
 * supplied key.
 */
export const eip155Adapter: ChainAdapter = {
  provider: 'eip155',

  canonicalize(address: string): string {
    if (!isAddress(address)) {
      throw createError({ statusCode: 400, message: 'Invalid Ethereum address' });
    }
    return getAddress(address).toLowerCase();
  },

  buildMessage(input: MessageInput): string {
    // EIP-4361 requires the EIP-55 checksummed form, and SIWE clients that
    // validate the message reject a lowercased one. Callers pass the canonical
    // (lowercase) form used for storage, so checksum it for the message only —
    // parseMessage and verify are both case-insensitive.
    const checksummed = getAddress(input.address);

    return [
      `${input.domain} wants you to sign in with your Ethereum account:`,
      '',
      checksummed,
      '',
      STATEMENT,
      `URI: ${input.uri}`,
      `Chain ID: ${input.chainId}`,
      `Nonce: ${input.nonce}`,
      `Issued At: ${input.issuedAt}`,
    ].join('\n');
  },

  parseMessage(message: string): ParsedMessage | null {
    const domain = message.match(/^(.+?) wants you to sign in with your Ethereum account:/)?.[1];
    const address = message.match(/\n\n(0x[a-fA-F0-9]{40})\n\n/)?.[1];
    const chainId = message.match(/\nChain ID: (\d+)/)?.[1];
    const nonce = message.match(/\nNonce: ([a-f0-9]{64})/)?.[1];
    const issuedAt = message.match(/\nIssued At: (.+)$/)?.[1];

    if (!domain || !address || !chainId || !nonce || !issuedAt) return null;

    return { domain, address: address.toLowerCase(), chainId: Number(chainId), nonce, issuedAt };
  },

  async verify(message: string, signature: string, address: string): Promise<boolean> {
    try {
      const recovered = await recoverMessageAddress({
        message,
        signature: signature as `0x${string}`,
      });
      return recovered.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  },
};
