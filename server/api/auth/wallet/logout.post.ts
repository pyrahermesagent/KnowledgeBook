export default defineEventHandler(async (event) => {
  // Clear wallet session data
  const session = await useSession(event)
  session.data.wallet = undefined
  await session.save()

  return {
    success: true,
    message: 'Wallet disconnected successfully'
  }
})
