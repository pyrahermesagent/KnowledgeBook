<script setup lang="ts">
const { loggedIn, user } = useUserSession()
</script>

<template>
  <div class="landing">
    <header class="landing-header">
      <div class="brand"><span class="brand-mark">📖</span> KnowledgeBook</div>
      <nav>
        <NuxtLink v-if="loggedIn" to="/dashboard" class="btn btn-primary">
          Dashboard
        </NuxtLink>
        <a v-else href="/api/auth/google" class="btn btn-primary">Sign in with Google</a>
      </nav>
    </header>

    <main class="hero">
      <h1>Documentation your users<br>will actually read.</h1>
      <p class="muted">
        Create beautiful docs and guides with full markdown support, instant autosave
        and a shareable link. No build steps, no hassle.
      </p>
      <a v-if="!loggedIn" href="/api/auth/google" class="btn btn-primary btn-lg">
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81" /></svg>
        Get started with Google
      </a>
      <NuxtLink v-else to="/dashboard" class="btn btn-primary btn-lg">
        Continue as {{ user?.name || user?.email }}
      </NuxtLink>

      <div class="features">
        <div class="feature">
          <h3>✍️ Full markdown</h3>
          <p class="muted">Headings, tables, code blocks with syntax highlighting, images and more.</p>
        </div>
        <div class="feature">
          <h3>⚡ Autosave</h3>
          <p class="muted">Every keystroke is saved automatically. Never lose an edit again.</p>
        </div>
        <div class="feature">
          <h3>🎨 Your brand</h3>
          <p class="muted">Custom accent color, icon and description for every project.</p>
        </div>
      </div>
    </main>

    <footer class="muted">KnowledgeBook — open source documentation platform</footer>
  </div>
</template>

<style scoped>
.landing { min-height: 100%; display: flex; flex-direction: column; }
.landing-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 32px;
  border-bottom: 1px solid var(--border);
}
.brand { font-weight: 700; font-size: 18px; display: flex; align-items: center; gap: 8px; }
.hero { flex: 1; max-width: 860px; margin: 0 auto; padding: 80px 24px; text-align: center; }
.hero h1 { font-size: 44px; line-height: 1.15; margin: 0 0 16px; }
.hero > p { font-size: 18px; max-width: 560px; margin: 0 auto 32px; }
.btn-lg { padding: 12px 24px; font-size: 16px; }
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
  margin-top: 80px;
  text-align: left;
}
.feature { padding: 20px; border: 1px solid var(--border); border-radius: var(--radius); }
.feature h3 { margin: 0 0 8px; }
.feature p { margin: 0; font-size: 14px; }
footer { text-align: center; padding: 24px; font-size: 13px; }
</style>
