export default defineOAuthGoogleEventHandler({
  async onSuccess (event, { user }) {
    const db = useDb()
    db.prepare(`
      INSERT INTO users (google_id, email, name, avatar)
      VALUES (@sub, @email, @name, @picture)
      ON CONFLICT (google_id) DO UPDATE SET email = @email, name = @name, avatar = @picture
    `).run({
      sub: String(user.sub),
      email: user.email ?? '',
      name: user.name ?? '',
      picture: user.picture ?? ''
    })
    const row = db.prepare('SELECT id, email, name, avatar FROM users WHERE google_id = ?')
      .get(String(user.sub)) as { id: number, email: string, name: string, avatar: string }
    await setUserSession(event, { user: row })
    return sendRedirect(event, '/dashboard')
  },
  onError (event, error) {
    console.error('Google OAuth error:', error)
    return sendRedirect(event, '/?auth_error=1')
  }
})
