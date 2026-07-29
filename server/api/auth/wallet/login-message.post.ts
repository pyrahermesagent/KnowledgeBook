import { getAdapter } from '#utils/auth/chains';
import { generateNonce, getAuthConfig } from '#utils/auth/verify';
import { WALLET_PROVIDERS, type StoredNonce, type WalletProvider } from '#utils/auth/types';
import { requireAuthRateLimit } from '#utils/ratelimit';

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login-message');

  const body = await readBody<{ provider?: string; address?: string; chainId?: number }>(event);

  if (!body.provider || !WALLET_PROVIDERS.includes(body.provider as WalletProvider)) {
    throw createError({ statusCode: 400, message: 'Missing or unsupported provider' });
  }
  if (!body.address) {
    throw createError({ statusCode: 400, message: 'Missing required field: address' });
  }

  const provider = body.provider as WalletProvider;
  const adapter = getAdapter(provider);

  // Rejects anything not well-formed for this ecosystem before it reaches the
  // login message or the database.
  const address = adapter.canonicalize(body.address);

  const { domain, uri, evmChainIds } = getAuthConfig();

  // Always issue a fresh challenge. Reusing one still sitting in the session
  // would let an old signature be replayed against a new login. Stored under
  // `secure` so it stays server-side only, and bound to the ecosystem and
  // account it was issued for.
  const nonce: StoredNonce = {
    value: generateNonce(),
    issuedAt: Date.now(),
    provider,
    address,
  };
  await setUserSession(event, { secure: { walletNonce: nonce } });

  const chainId =
    provider === 'eip155'
      ? evmChainIds.includes(Number(body.chainId))
        ? Number(body.chainId)
        : evmChainIds[0]
      : undefined;

  return {
    success: true,
    message: adapter.buildMessage({
      address,
      nonce: nonce.value,
      issuedAt: new Date().toISOString(),
      domain,
      uri,
      chainId,
    }),
  };
});
