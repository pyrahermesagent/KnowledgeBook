/**
 * Route middleware requiring a connected wallet for dashboard/project routes.
 *
 * This lives in middleware/ (app route middleware), not server/middleware/.
 * Nitro treats every file in server/middleware as an event handler that runs on
 * each request, so defineNuxtRouteMiddleware and navigateTo — both app-only —
 * could never work there.
 */
export default defineNuxtRouteMiddleware((to) => {
  const { session } = useUserSession();

  if (!session.value?.wallet) {
    if (to.path.startsWith('/dashboard') || to.path.startsWith('/projects')) {
      return navigateTo('/dashboard');
    }
  }
});
