import { generateNonce } from '#utils/auth-wallet'

export default defineEventHandler(async (event) => {
  const nonce = generateNonce()
  
  // Store nonce in session for validation
  const session = await useSession(event)
  session.data.walletNonce = nonce
  await session.save()
  
  return {
    success: true,
    nonce
  }
})
