export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  // Drop only the wallet, so a user signed in with Google in the same session
  // is not logged out of that too. replaceUserSession rewrites the session
  // rather than merging, which is what actually removes the key.
  const { wallet, ...rest } = session;

  await replaceUserSession(event, rest);

  return {
    success: true,
    message: 'Wallet disconnected successfully',
  };
});
