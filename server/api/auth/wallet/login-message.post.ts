import { createLoginMessage, generateNonce, normalizeAddress, type StoredNonce } from '#utils/auth-wallet'
import { requireAuthRateLimit } from '#utils/ratelimit'

export default defineEventHandler(async (event) => {
  requireAuthRateLimit(event, 'login-message')

  const body = await readBody(event)
  const { address } = body

  if (!address) {
    throw createError({ statusCode: 400, message: 'Missing required field: address' })
  }

  // Rejects anything that is not a well-formed EVM address before it reaches
  // the login message or the database.
  const walletAddress = normalizeAddress(address)

  // Always issue a fresh challenge. Reusing a nonce still sitting in the
  // session would let an old signature be replayed against a new login.
  // Stored under `secure` so it stays server-side only.
  const nonce: StoredNonce = { value: generateNonce(), issuedAt: Date.now() }
  await setUserSession(event, { secure: { walletNonce: nonce } })

  return {
    success: true,
    message: createLoginMessage(walletAddress, nonce.value),
  }
})
