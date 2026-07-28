// tests/wallet-auth-retry.test.ts
//
// useWalletAuth() itself needs Nuxt auto-imports (ref, useUserSession,
// $fetch) that only exist inside a running Nuxt app, so it isn't directly
// unit-testable under plain vitest. isExpiredChallengeError is the one piece
// of pure decision logic pulled out of it — it drives whether signIn()
// retries a wallet login once — so it's covered here on its own.
import { describe, it, expect } from 'vitest';
import { isExpiredChallengeError } from '../composables/useWalletAuth';

describe('isExpiredChallengeError', () => {
  it('returns true for a $fetch error carrying the message on data.message', () => {
    const error = { data: { message: 'Login challenge expired, please retry' } };
    expect(isExpiredChallengeError(error)).toBe(true);
  });

  it('returns true for a plain Error whose message says the challenge expired', () => {
    expect(isExpiredChallengeError(new Error('Login challenge expired, please retry'))).toBe(true);
  });

  it('returns false for an unrelated error', () => {
    // The case that matters: a predicate that returned true for everything
    // would turn every failed sign-in into a silent retry-then-fail instead
    // of surfacing the real error.
    expect(isExpiredChallengeError(new Error('Invalid signature'))).toBe(false);
  });

  it('returns false, without throwing, for null or undefined', () => {
    expect(isExpiredChallengeError(null)).toBe(false);
    expect(isExpiredChallengeError(undefined)).toBe(false);
  });
});
