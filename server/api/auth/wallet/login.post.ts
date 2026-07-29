import { verifyLoginAttempt } from '#utils/auth/verify';
import { resolveIdentity } from '#utils/auth/identities';
import { WALLET_PROVIDERS, type StoredNonce, type WalletProvider } from '#utils/auth/types';
import { requireAuthRateLimit } from '#utils/ratelimit';

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login');

  const body = await readBody<{
    provider?: string;
    message?: string;
    signature?: string;
    chainId?: string;
    label?: string;
  }>(event);

  if (!body.provider || !WALLET_PROVIDERS.includes(body.provider as WalletProvider)) {
    throw createError({ statusCode: 400, message: 'Missing or unsupported provider' });
  }
  if (!body.message || !body.signature) {
    throw createError({ statusCode: 400, message: 'Missing required field: message or signature' });
  }

  const provider = body.provider as WalletProvider;
  const session = await getUserSession(event);
  const storedNonce = (session.secure as { walletNonce?: StoredNonce } | undefined)?.walletNonce;

  // Single-use challenge: drop it before verifying, so a failed or replayed
  // attempt cannot be retried against the same nonce. replaceUserSession rather
  // than setUserSession, because the latter merges and would leave it in place.
  await replaceUserSession(event, {
    ...session,
    secure: { ...(session.secure as Record<string, unknown>), walletNonce: undefined },
  });

  const { success, address, reason } = await verifyLoginAttempt(
    provider,
    body.message,
    body.signature,
    storedNonce
  );

  if (!success) {
    throw createError({ statusCode: 401, message: reason || 'Invalid signature' });
  }

  // Link to the signed-in account when there is one; otherwise sign in or
  // create. resolveIdentity throws 409 if the wallet belongs to someone else.
  const currentUserId = (session.user as { id: number } | undefined)?.id ?? null;

  const { userId } = resolveIdentity(
    {
      provider,
      // The address the server recovered or verified — never a body field.
      subject: address,
      chainId: typeof body.chainId === 'string' ? body.chainId : null,
      label: typeof body.label === 'string' ? body.label.slice(0, 64) : null,
    },
    currentUserId
  );

  const user = useDb()
    .prepare('SELECT id, email, name, avatar FROM users WHERE id = ?')
    .get(userId) as { id: number; email: string | null; name: string; avatar: string };

  await setUserSession(event, { user });

  return { ok: true, user };
});
