// server/utils/auth/verify.ts
import crypto from 'node:crypto';
import { getAdapter } from './chains';
import { NONCE_TTL_MS, type StoredNonce, type WalletProvider } from './types';

export interface VerifyResult {
  success: boolean;
  address: string;
  reason?: string;
}

/** A cryptographically random challenge value. */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Deployment-specific sign-in settings.
 *
 * The domain and URI are bound into every login message and re-checked here, so
 * a message signed for another deployment cannot be replayed against this one.
 */
export function getAuthConfig(): { domain: string; uri: string; evmChainIds: number[] } {
  const config = useRuntimeConfig();

  const evmChainIds = String(config.web3?.evmChainIds ?? '1')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  return {
    domain: config.web3?.appDomain || 'localhost:3000',
    uri: config.web3?.appUri || 'http://localhost:3000/login',
    evmChainIds: evmChainIds.length ? evmChainIds : [1],
  };
}

/** Constant-time compare, so a mismatching nonce cannot be probed byte by byte. */
function nonceMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Full server-side validation of a login attempt, shared by every ecosystem.
 *
 * A signature alone proves key custody but not freshness or intent, so the
 * message is also checked against the challenge this session was issued, the
 * configured domain, and — for EVM — the chain allowlist. The caller must have
 * already cleared the stored challenge so a captured signature cannot be
 * replayed.
 *
 * The returned address is the one parsed out of the signed message. It is the
 * only address a caller may trust.
 */
export async function verifyLoginAttempt(
  provider: WalletProvider,
  message: string,
  signature: string,
  storedNonce: StoredNonce | undefined
): Promise<VerifyResult> {
  const fail = (reason: string): VerifyResult => ({ success: false, address: '', reason });

  if (!storedNonce) return fail('No login challenge issued for this session');
  if (Date.now() - storedNonce.issuedAt > NONCE_TTL_MS) {
    return fail('Login challenge expired, please retry');
  }

  const adapter = getAdapter(provider);
  const parsed = adapter.parseMessage(message);
  if (!parsed) return fail('Malformed login message');

  if (!nonceMatches(storedNonce.value, parsed.nonce)) return fail('Invalid login challenge');

  // The challenge is bound to the ecosystem and account it was issued for, so
  // one minted for a Solana login cannot be spent on an EVM message.
  if (storedNonce.provider !== provider) {
    return fail('Login challenge was issued for a different ecosystem');
  }

  let canonical: string;
  try {
    canonical = adapter.canonicalize(parsed.address);
  } catch {
    return fail('Malformed login message');
  }
  if (canonical !== storedNonce.address) {
    return fail('Login challenge was issued for a different account');
  }

  const { domain, evmChainIds } = getAuthConfig();
  if (parsed.domain !== domain) return fail('Login message issued for a different domain');

  // Only SIWE carries a numeric chain id; the other ecosystems report chain
  // information that is stored for display and never trusted here.
  if (provider === 'eip155' && !evmChainIds.includes(parsed.chainId ?? -1)) {
    return fail('Login message issued for an unsupported chain');
  }

  if (!(await adapter.verify(message, signature, parsed.address))) {
    return fail('Invalid signature');
  }

  return { success: true, address: canonical };
}
