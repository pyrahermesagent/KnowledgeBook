export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    try {
      const db = useDb();
      const sub = String(user.sub);

      const upsert = db.transaction(() => {
        const identity = db
          .prepare("SELECT user_id FROM user_identities WHERE provider = 'google' AND subject = ?")
          .get(sub) as { user_id: number } | undefined;

        if (identity) {
          db.prepare('UPDATE users SET email = ?, name = ?, avatar = ? WHERE id = ?').run(
            user.email ?? null,
            user.name ?? '',
            user.picture ?? '',
            identity.user_id
          );
          db.prepare(
            "UPDATE user_identities SET last_used_at = datetime('now') WHERE provider = 'google' AND subject = ?"
          ).run(sub);
          return identity.user_id;
        }

        const { id } = db
          .prepare('INSERT INTO users (email, name, avatar) VALUES (?, ?, ?) RETURNING id')
          .get(user.email ?? null, user.name ?? '', user.picture ?? '') as { id: number };

        db.prepare(
          `INSERT INTO user_identities (user_id, provider, subject, last_used_at)
           VALUES (?, 'google', ?, datetime('now'))`
        ).run(id, sub);

        return id;
      });

      const userId = upsert();

      const row = db
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
