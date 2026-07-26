// Session cookies are sealed with iron-webcrypto, which rejects passwords
// shorter than 32 characters at runtime — sign-in would 500 on setUserSession.
// Surface that misconfiguration at boot instead.
export default defineNitroPlugin(() => {
  const password = process.env.NUXT_SESSION_PASSWORD ?? '';
  if (password.length < 32) {
    throw new Error(
      `[knowledgebook] NUXT_SESSION_PASSWORD is ${password.length} characters long but must be at least 32. ` +
        'Google sign-in WILL FAIL until it is replaced (e.g. `openssl rand -hex 32`).'
    );
  }
});
