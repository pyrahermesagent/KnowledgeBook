import { ref, computed, onMounted, watch } from 'vue';
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

// Theme manager composable
export function useThemeManager() {
  const activeThemeId = ref<string>(localStorage.getItem('activeTheme') || 'light');
  const systemPrefersDark = ref(false);

  // Initialize system preference detection
  onMounted(() => {
    if (typeof window !== 'undefined') {
      // Check system preference
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      systemPrefersDark.value = mediaQuery.matches;

      // Listen for changes
      mediaQuery.addEventListener('change', (e) => {
        systemPrefersDark.value = e.matches;
        applyTheme();
      });

      // Apply initial theme
      applyTheme();
    }
  });

  // Get current theme (resolves auto to actual theme)
  const currentTheme = computed((): Theme => {
    const theme = themes[activeThemeId.value];
    if (theme?.type === 'auto') {
      return themes[systemPrefersDark.value ? 'dark' : 'light'];
    }
    return theme || themes['light'];
  });

  // Get active theme ID (resolved for auto)
  const activeThemeIdResolved = computed((): string => {
    if (activeThemeId.value === 'auto') {
      return systemPrefersDark.value ? 'dark' : 'light';
    }
    return activeThemeId.value;
  });

  // Get resolved theme object
  const activeTheme = computed((): Theme => {
    const theme = themes[activeThemeId.value];
    if (theme?.type === 'auto') {
      return themes[systemPrefersDark.value ? 'dark' : 'light'];
    }
    return theme || themes['light'];
  });

  // Apply theme to CSS variables
  function applyTheme(themeId: string = activeThemeId.value): void {
    if (typeof document === 'undefined') return;

    const theme = themes[themeId];
    let resolvedTheme = theme;

    if (theme?.type === 'auto') {
      resolvedTheme = themes[systemPrefersDark.value ? 'dark' : 'light'];
    }

    if (!resolvedTheme?.colors) return;

    const root = document.documentElement;
    const colors = resolvedTheme.colors as ColorPalette;

    // Apply all CSS variables
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // Update localStorage
    localStorage.setItem('activeTheme', themeId);
  }

  // Toggle between light/dark/auto
  function toggleTheme(): void {
    const themeIds = Object.keys(themes);
    const currentIndex = themeIds.indexOf(activeThemeId.value);
    const nextIndex = (currentIndex + 1) % themeIds.length;
    activeThemeId.value = themeIds[nextIndex];
  }

  // Set specific theme
  function setTheme(themeId: string): void {
    if (themes[themeId]) {
      activeThemeId.value = themeId;
    } else {
      console.warn(`Theme "${themeId}" not found, falling back to light`);
      activeThemeId.value = 'light';
    }
  }

  // Watch for active theme changes and apply
  watch(activeThemeId, () => {
    applyTheme();
  });

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
