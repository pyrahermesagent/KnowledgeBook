import { resolveIdentity } from '#utils/auth/identities';

export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    try {
      const session = await getUserSession(event);
      const currentUserId = (session.user as { id: number } | undefined)?.id ?? null;

      const { userId } = resolveIdentity(
        {
          provider: 'google',
          subject: String(user.sub),
          displayName: user.name ?? '',
          email: user.email ?? null,
          avatar: user.picture ?? '',
        },
        currentUserId
      );

      const row = useDb()
        .prepare('SELECT id, email, name, avatar FROM users WHERE id = ?')
        .get(userId) as { id: number; email: string | null; name: string; avatar: string };

      await setUserSession(event, { user: row });
    } catch (error) {
      console.error('Google OAuth callback failed after token exchange:', error);
      return sendRedirect(event, '/?auth_error=1');
    }
    return sendRedirect(event, '/dashboard');
  },
  onError(event, error) {
    console.error('Google OAuth error:', error);
    return sendRedirect(event, '/?auth_error=1');
  },
});
