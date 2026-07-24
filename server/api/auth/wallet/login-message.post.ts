import { generateNonce } from '#utils/auth-wallet'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { address } = body

  if (!address) {
    throw createError({ statusCode: 400, message: 'Missing required field: address' })
  }

  // Get nonce from session or generate new one
  const session = await useSession(event)
  let nonce = session.data.walletNonce
  if (!nonce) {
    nonce = generateNonce()
    session.data.walletNonce = nonce
    await session.save()
  }

  // Create login message (imported inline to avoid circular deps)
  const domain = 'knowledgebook.app'
  const uri = 'https://knowledgebook.app/login'
  const statement = 'Please sign this message to confirm your identity.'
  const chainId = 1 // Ethereum mainnet
  const issuedAt = new Date().toISOString()
  const message = `${domain} wants you to sign in with your Ethereum account:\n\n${address}\n\n${statement}\nURI: ${uri}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`

  return {
    success: true,
    message
  }
})
