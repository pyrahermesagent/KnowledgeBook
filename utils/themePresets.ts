// Preset themes for a project's public docs.
//
// Each preset carries exactly the fields PATCH /api/projects/:slug/theme
// accepts, so applying one is a single request with no client-side mapping.
// All palettes keep text and muted text at WCAG AA contrast (>= 4.5:1)
// against their background — tests/theme-presets.test.ts enforces this.

export interface ThemePreset {
  id: string;
  name: string;
  accentColor: string;
  fontFamily: string;
  bgColor: string;
  bgSubtle: string;
  textColor: string;
  textColorMuted: string;
  borderColor: string;
  radius: number;
}

const SYSTEM_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-light',
    name: 'Classic Light',
    accentColor: '#346ddb',
    fontFamily: SYSTEM_SANS,
    bgColor: '#ffffff',
    bgSubtle: '#f7f8fa',
    textColor: '#1f2430',
    textColorMuted: '#6b7280',
    borderColor: '#e5e8ec',
    radius: 8,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    accentColor: '#5b9bff',
    fontFamily: SYSTEM_SANS,
    bgColor: '#0d1117',
    bgSubtle: '#161b22',
    textColor: '#e6edf3',
    textColorMuted: '#8b949e',
    borderColor: '#30363d',
    radius: 8,
  },
  {
    id: 'slate',
    name: 'Slate',
    accentColor: '#88c0d0',
    fontFamily: SYSTEM_SANS,
    bgColor: '#2e3440',
    bgSubtle: '#3b4252',
    textColor: '#eceff4',
    textColorMuted: '#aeb6c8',
    borderColor: '#4c566a',
    radius: 6,
  },
  {
    id: 'paper',
    name: 'Paper',
    accentColor: '#8a5a2b',
    fontFamily: 'Georgia, serif',
    bgColor: '#f7f1e3',
    bgSubtle: '#efe7d3',
    textColor: '#3e3428',
    textColorMuted: '#6f6350',
    borderColor: '#e3d7bd',
    radius: 4,
  },
  {
    id: 'forest',
    name: 'Forest',
    accentColor: '#256e43',
    fontFamily: SYSTEM_SANS,
    bgColor: '#fbfdfb',
    bgSubtle: '#eef4ef',
    textColor: '#1d2b22',
    textColorMuted: '#5b6b60',
    borderColor: '#d6e3d9',
    radius: 8,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    accentColor: '#0e7490',
    fontFamily: SYSTEM_SANS,
    bgColor: '#fafcfe',
    bgSubtle: '#ecf3f8',
    textColor: '#14303d',
    textColorMuted: '#526b79',
    borderColor: '#d3e2eb',
    radius: 8,
  },
  {
    id: 'blossom',
    name: 'Blossom',
    accentColor: '#be185d',
    fontFamily: SYSTEM_SANS,
    bgColor: '#fffbfd',
    bgSubtle: '#fbeff4',
    textColor: '#38202c',
    textColorMuted: '#77596a',
    borderColor: '#f3d9e4',
    radius: 12,
  },
  {
    id: 'grape',
    name: 'Grape',
    accentColor: '#6d28d9',
    fontFamily: SYSTEM_SANS,
    bgColor: '#fdfcff',
    bgSubtle: '#f5f1fb',
    textColor: '#251b38',
    textColorMuted: '#645a78',
    borderColor: '#e4dcf2',
    radius: 10,
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    accentColor: '#0033cc',
    fontFamily: SYSTEM_SANS,
    bgColor: '#ffffff',
    bgSubtle: '#f0f0f0',
    textColor: '#000000',
    textColorMuted: '#2e2e2e',
    borderColor: '#202020',
    radius: 0,
  },
];

/**
 * Finds the preset a project's stored theme corresponds to, or null when the
 * theme predates presets (hand-tuned values). Accent, background, and text
 * colors are enough to identify a preset; the remaining fields follow from
 * them and comparing fewer fields keeps old rows with stale bgSubtle or
 * textColorMuted values matching their preset.
 */
export function matchThemePreset(theme: {
  accentColor?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
}): ThemePreset | null {
  const norm = (value?: string | null) => (value ?? '').trim().toLowerCase();
  return (
    THEME_PRESETS.find(
      (preset) =>
        norm(preset.accentColor) === norm(theme.accentColor) &&
        norm(preset.bgColor) === norm(theme.bgColor) &&
        norm(preset.textColor) === norm(theme.textColor)
    ) ?? null
  );
}
