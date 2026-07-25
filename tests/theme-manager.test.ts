import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useThemeManager } from '../composables/useThemeManager';

/**
 * useThemeManager runs inside app.vue's setup, which Nuxt executes on the
 * server during SSR. There is no localStorage there, so any unguarded access
 * throws and takes down every route with a 500 — not just the theme UI.
 */
describe('useThemeManager under SSR (no localStorage)', () => {
  const globals = globalThis as Record<string, unknown>;
  let savedLocalStorage: unknown;
  let savedWindow: unknown;
  let savedDocument: unknown;

  beforeEach(() => {
    savedLocalStorage = globals.localStorage;
    savedWindow = globals.window;
    savedDocument = globals.document;
    delete globals.localStorage;
    delete globals.window;
    delete globals.document;
    // Theme state is shared module-wide, so reset it rather than relying on
    // whatever an earlier test left behind.
    useThemeManager().setTheme('light');
  });

  afterEach(() => {
    globals.localStorage = savedLocalStorage;
    globals.window = savedWindow;
    globals.document = savedDocument;
  });

  it('constructs without touching localStorage', () => {
    expect(() => useThemeManager()).not.toThrow();
  });

  it('falls back to the light theme when no stored preference is readable', () => {
    const { activeThemeId, activeTheme } = useThemeManager();
    expect(activeThemeId.value).toBe('light');
    expect(activeTheme.value.id).toBe('light');
  });

  it('applyTheme is a no-op instead of throwing when there is no DOM', () => {
    const { applyTheme } = useThemeManager();
    expect(() => applyTheme('dark')).not.toThrow();
  });

  it('setTheme and toggleTheme do not throw without a DOM', () => {
    const { setTheme, toggleTheme, activeThemeId } = useThemeManager();
    expect(() => setTheme('dark')).not.toThrow();
    expect(activeThemeId.value).toBe('dark');
    expect(() => toggleTheme()).not.toThrow();
  });
});

describe('useThemeManager shared state', () => {
  const globals = globalThis as Record<string, unknown>;

  beforeEach(() => {
    // Fresh in-memory localStorage so each test starts from a known theme.
    const store = new Map<string, string>();
    globals.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    useThemeManager().setTheme('light');
  });

  afterEach(() => {
    delete globals.localStorage;
  });

  /**
   * app.vue and ThemeToggle.vue each call useThemeManager(). If the composable
   * hands out per-call refs, the toggle button mutates a ref nobody renders and
   * the theme appears stuck.
   */
  it('shares theme state between separate call sites', () => {
    const rootScope = useThemeManager();
    const togglerScope = useThemeManager();

    rootScope.setTheme('light');
    expect(togglerScope.activeThemeId.value).toBe('light');

    togglerScope.setTheme('dark');

    expect(rootScope.activeThemeId.value).toBe('dark');
    expect(rootScope.activeTheme.value.id).toBe('dark');
  });

  it('reflects toggleTheme from one scope in the other', () => {
    const a = useThemeManager();
    const b = useThemeManager();

    a.setTheme('light');
    b.toggleTheme();

    expect(a.activeThemeId.value).toBe(b.activeThemeId.value);
    expect(a.activeThemeId.value).not.toBe('light');
  });
});
