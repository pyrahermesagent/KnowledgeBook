import { verifyWalletSignature, upsertWalletUser } from '#utils/auth-wallet'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Validate required fields
  if (!body.address || !body.signature) {
    throw createError({ statusCode: 400, message: 'Missing required field: address or signature' })
  }

  const { address, signature } = body

  try {
    // Verify wallet signature
    const { success, address: verifiedAddress } = await verifyWalletSignature(
      event,
      body.message || '',
      signature
    )

    if (!success) {
      throw createError({ statusCode: 401, message: 'Invalid signature' })
    }

    if (verifiedAddress.toLowerCase() !== address.toLowerCase()) {
      throw createError({ statusCode: 401, message: 'Signature does not match address' })
    }

    // Store/update wallet user
    const walletId = upsertWalletUser(verifiedAddress, 1) // Default to Ethereum mainnet

    // Set session
    const session = await useSession(event)
    session.data.wallet = {
      wallet_address: verifiedAddress,
      chain_id: 1
    }
    await session.save()

    return {
      ok: true,
      wallet: {
        address: verifiedAddress,
        chain_id: 1
      }
    }
  } catch (error: any) {
    console.error('Wallet login error:', error)
    throw createError({ statusCode: 500, message: error.message || 'Wallet login failed' })
  }
})
