import { verifyLoginAttempt, upsertWalletUser, getWeb3Config, type StoredNonce } from '#utils/auth-wallet'
import { requireAuthRateLimit } from '#utils/ratelimit'

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login')

  const body = await readBody(event)

  if (!body.message || !body.signature) {
    throw createError({ statusCode: 400, message: 'Missing required field: message or signature' })
  }

  const session = await getUserSession(event)
  const storedNonce = (session.secure as { walletNonce?: StoredNonce } | undefined)?.walletNonce

  // Single-use challenge: drop it before verifying, so a failed or replayed
  // attempt cannot be retried against the same nonce. replaceUserSession is
  // used rather than setUserSession because the latter merges, which would
  // leave the old nonce in place.
  await replaceUserSession(event, {
    ...session,
    secure: { ...(session.secure as Record<string, unknown>), walletNonce: undefined },
  })

  const { success, address, reason } = await verifyLoginAttempt(
    body.message,
    body.signature,
    storedNonce
  )

  if (!success) {
    throw createError({ statusCode: 401, message: reason || 'Invalid signature' })
  }

  const { chainId } = getWeb3Config()

  // Bind the session to the recovered signer, never to a client-supplied address.
  upsertWalletUser(address, chainId)

  await setUserSession(event, {
    wallet: {
      wallet_address: address,
      chain_id: chainId,
    },
  })

  return {
    ok: true,
    wallet: {
      address,
      chain_id: chainId,
    },
  }
})
