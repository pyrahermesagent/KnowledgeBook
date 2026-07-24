/**
 * Middleware to require wallet authentication for routes
 * Checks if user has a valid wallet session before allowing access
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
  // Get session
  const session = useSession()
  
  // Check if wallet is connected
  if (!session.data.wallet) {
    // Redirect to dashboard if trying to access protected routes
    if (to.path.startsWith('/dashboard') || to.path.startsWith('/projects')) {
      return navigateTo('/dashboard')
    }
  }
})
