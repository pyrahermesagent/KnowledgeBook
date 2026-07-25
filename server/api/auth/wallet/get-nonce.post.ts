import { generateNonce, type StoredNonce } from '#utils/auth-wallet';
import { requireAuthRateLimit } from '#utils/ratelimit';

/**
 * Issues a bare login nonce.
 *
 * The in-app flow uses /login-message instead, which returns the full EIP-4361
 * message to sign. This endpoint remains for SDK clients that build the message
 * themselves; both write the same session challenge, so calling this one
 * invalidates any message previously handed out by /login-message.
 */
export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'get-nonce');

  const nonce: StoredNonce = { value: generateNonce(), issuedAt: Date.now() };

  await setUserSession(event, { secure: { walletNonce: nonce } });

  return {
    success: true,
    nonce: nonce.value,
  };
});
