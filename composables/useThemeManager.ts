import { ref, computed, getCurrentInstance, onMounted, watch } from 'vue';
import type { Theme, ColorPalette } from '~/types/theme';

// Default theme definitions
const themes: Record<string, Theme> = {
  light: {
    id: 'light',
    name: 'Light Theme',
    type: 'light',
    colors: {
      primary: '#346ddb',
      primaryHover: '#2a5ec4',
      secondary: '#64748b',
      secondaryHover: '#475569',
      accent: '#346ddb',
      accentSoft: 'rgba(52, 109, 219, 0.12)',
      background: '#ffffff',
      surface: '#f7f8fa',
      border: '#e5e8ec',
      text: '#1f2430',
      textMuted: '#6b7280',
      radius: '8px',
      sidebarWidth: '280px',
      font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    layout: {
      sidebar: { width: 280, position: 'left', collapsed: false },
      header: { height: 60, visible: true, sticky: false },
      footer: { visible: false, height: 40 },
      spacing: { unit: 4, scale: 'normal' },
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.6,
      headingSize: 24,
    },
    components: {
      button: { borderRadius: 8, padding: '8px 16px' },
      card: { borderRadius: 8, shadow: 'none' },
      input: { borderRadius: 8, borderColor: '#e5e8ec' },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: true,
  },
  dark: {
    id: 'dark',
    name: 'Dark Theme',
    type: 'dark',
    colors: {
      primary: '#5b9bff',
      primaryHover: '#7cb0ff',
      secondary: '#94a3b8',
      secondaryHover: '#cbd5e1',
      accent: '#5b9bff',
      accentSoft: 'rgba(91, 155, 255, 0.12)',
      background: '#0d1117',
      surface: '#161b22',
      border: '#30363d',
      text: '#e6edf3',
      textMuted: '#8b949e',
      radius: '8px',
      sidebarWidth: '280px',
      font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    layout: {
      sidebar: { width: 280, position: 'left', collapsed: false },
      header: { height: 60, visible: true, sticky: false },
      footer: { visible: false, height: 40 },
      spacing: { unit: 4, scale: 'normal' },
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.6,
      headingSize: 24,
    },
    components: {
      button: { borderRadius: 8, padding: '8px 16px' },
      card: { borderRadius: 8, shadow: 'none' },
      input: { borderRadius: 8, borderColor: '#30363d' },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: false,
  },
  auto: {
    id: 'auto',
    name: 'Auto (System)',
    type: 'auto',
    colors: {
      primary: '#346ddb',
      primaryHover: '#2a5ec4',
      secondary: '#64748b',
      secondaryHover: '#475569',
      accent: '#346ddb',
      accentSoft: 'rgba(52, 109, 219, 0.12)',
      background: '#ffffff',
      surface: '#f7f8fa',
      border: '#e5e8ec',
      text: '#1f2430',
      textMuted: '#6b7280',
      radius: '8px',
      sidebarWidth: '280px',
      font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    },
    layout: {
      sidebar: { width: 280, position: 'left', collapsed: false },
      header: { height: 60, visible: true, sticky: false },
      footer: { visible: false, height: 40 },
      spacing: { unit: 4, scale: 'normal' },
    },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.6,
      headingSize: 24,
    },
    components: {
      button: { borderRadius: 8, padding: '8px 16px' },
      card: { borderRadius: 8, shadow: 'none' },
      input: { borderRadius: 8, borderColor: '#e5e8ec' },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDefault: false,
  },
};

const STORAGE_KEY = 'activeTheme';

/**
 * Maps a ColorPalette key onto the CSS custom property the stylesheets read.
 *
 * The palette is camelCase while assets/css/main.css and every component style
 * declare kebab-case names, and two of them are not even a case conversion
 * (`background` is `--bg`, `surface` is `--bg-subtle`). Deriving the name with
 * `--${key}` writes properties nothing consumes, which left dark mode painting
 * near-white text onto the still-white `--bg`.
 */
const CSS_VARIABLES: Record<keyof ColorPalette, string> = {
  primary: '--primary',
  primaryHover: '--primary-hover',
  secondary: '--secondary',
  secondaryHover: '--secondary-hover',
  accent: '--accent',
  accentSoft: '--accent-soft',
  background: '--bg',
  surface: '--bg-subtle',
  border: '--border',
  text: '--text',
  textMuted: '--text-muted',
  radius: '--radius',
  sidebarWidth: '--sidebar-width',
  font: '--font',
  mono: '--mono',
};

function hasTheme(themeId: string): boolean {
  return Object.prototype.hasOwnProperty.call(themes, themeId);
}

/** localStorage throws on access in Safari private mode and cookie-blocked frames. */
function readStoredTheme(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTheme(themeId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    /* preference just won't persist; the theme still applies for this session */
  }
}

// Shared across every call site. app.vue renders the root theme class and
// ThemeToggle.vue drives the switch, so per-call refs left the button mutating
// state nobody rendered. Module scope is safe under SSR because nothing mutates
// these on the server: the client bootstrap below is the only writer that runs
// outside a user event, and it bails out when `window` is undefined.
const activeThemeId = ref<string>('light');
const systemPrefersDark = ref(false);
let clientReady = false;

// Apply theme to CSS variables
function applyTheme(themeId: string = activeThemeId.value): void {
  if (typeof document === 'undefined') return;

  const theme = hasTheme(themeId) ? themes[themeId] : undefined;
  let resolvedTheme = theme;

  if (theme?.type === 'auto') {
    resolvedTheme = themes[systemPrefersDark.value ? 'dark' : 'light'];
  }

  if (!resolvedTheme?.colors) return;

  const root = document.documentElement;
  const colors = resolvedTheme.colors as ColorPalette;

  Object.entries(colors).forEach(([key, value]) => {
    const cssName = CSS_VARIABLES[key as keyof ColorPalette];
    if (cssName) root.style.setProperty(cssName, value);
  });

  writeStoredTheme(themeId);
}

/**
 * Restores the stored preference and starts tracking the system setting.
 *
 * Deliberately deferred to mount: reading localStorage during setup would make
 * the client's first render disagree with the server's and trip a hydration
 * mismatch, on top of throwing outright when there is no localStorage at all.
 */
function initClient(): void {
  if (clientReady || typeof window === 'undefined') return;
  clientReady = true;

  const stored = readStoredTheme();
  if (stored && hasTheme(stored)) {
    activeThemeId.value = stored;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemPrefersDark.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', (e) => {
    systemPrefersDark.value = e.matches;
    applyTheme();
  });

  applyTheme();
}

function resolveTheme(themeId: string, prefersDark: boolean): Theme {
  const theme = hasTheme(themeId) ? themes[themeId] : undefined;
  if (theme?.type === 'auto') {
    return themes[prefersDark ? 'dark' : 'light'];
  }
  return theme || themes['light'];
}

// Registered once, at module scope, so a theme change repaints exactly one time
// no matter how many components hold the composable.
watch(activeThemeId, (themeId) => {
  applyTheme(themeId);
});

// Theme manager composable
export function useThemeManager() {
  // Only inside a component; the composable is also imported directly by tests.
  if (getCurrentInstance()) {
    onMounted(initClient);
  } else {
    initClient();
  }

  // Get current theme (resolves auto to actual theme)
  const currentTheme = computed((): Theme =>
    resolveTheme(activeThemeId.value, systemPrefersDark.value)
  );

  // Get active theme ID (resolved for auto)
  const activeThemeIdResolved = computed((): string => {
    if (activeThemeId.value === 'auto') {
      return systemPrefersDark.value ? 'dark' : 'light';
    }
    return activeThemeId.value;
  });

  // Get resolved theme object
  const activeTheme = computed((): Theme =>
    resolveTheme(activeThemeId.value, systemPrefersDark.value)
  );

  // Toggle between light/dark/auto
  function toggleTheme(): void {
    const themeIds = Object.keys(themes);
    const currentIndex = themeIds.indexOf(activeThemeId.value);
    const nextIndex = (currentIndex + 1) % themeIds.length;
    activeThemeId.value = themeIds[nextIndex];
  }

  // Set specific theme
  function setTheme(themeId: string): void {
    if (hasTheme(themeId)) {
      activeThemeId.value = themeId;
    } else {
      console.warn(`Theme "${themeId}" not found, falling back to light`);
      activeThemeId.value = 'light';
    }
  }

  return {
    activeThemeId,
    activeThemeIdResolved,
    activeTheme,
    currentTheme,
    systemPrefersDark,
    themes,
    applyTheme,
    toggleTheme,
    setTheme,
  };
}

// Composable type export
export type ThemeManager = ReturnType<typeof useThemeManager>;
