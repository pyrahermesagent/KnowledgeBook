import { describe, it, expect } from 'vitest';
import { THEME_PRESETS, matchThemePreset } from '../utils/themePresets';

const HEX = /^#[0-9a-f]{6}$/;

/** WCAG 2.x relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('THEME_PRESETS', () => {
  it('offers exactly 9 presets', () => {
    expect(THEME_PRESETS).toHaveLength(9);
  });

  it('has unique ids and names', () => {
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length);
    expect(new Set(THEME_PRESETS.map((p) => p.name)).size).toBe(THEME_PRESETS.length);
  });

  it('uses six-digit lowercase hex for every color (server validates this format)', () => {
    for (const preset of THEME_PRESETS) {
      for (const color of [
        preset.accentColor,
        preset.bgColor,
        preset.bgSubtle,
        preset.textColor,
        preset.textColorMuted,
        preset.borderColor,
      ]) {
        expect(color, `${preset.id}: ${color}`).toMatch(HEX);
      }
    }
  });

  it('keeps radius inside the 0–20 range the PATCH endpoint enforces', () => {
    for (const preset of THEME_PRESETS) {
      expect(preset.radius, preset.id).toBeGreaterThanOrEqual(0);
      expect(preset.radius, preset.id).toBeLessThanOrEqual(20);
    }
  });

  it('keeps text and muted text at WCAG AA contrast against the background', () => {
    for (const preset of THEME_PRESETS) {
      expect(
        contrast(preset.textColor, preset.bgColor),
        `${preset.id} text`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(preset.textColorMuted, preset.bgColor),
        `${preset.id} muted text`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the accent readable on the background (links use it as text color)', () => {
    for (const preset of THEME_PRESETS) {
      expect(
        contrast(preset.accentColor, preset.bgColor),
        `${preset.id} accent`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('starts with a preset matching the project defaults, so new projects show as themed', () => {
    const [first] = THEME_PRESETS;
    expect(first.id).toBe('classic-light');
    expect(first.accentColor).toBe('#346ddb');
    expect(first.bgColor).toBe('#ffffff');
    expect(first.textColor).toBe('#1f2430');
    expect(first.radius).toBe(8);
  });
});

describe('matchThemePreset', () => {
  it('identifies a stored theme by accent, background, and text color', () => {
    for (const preset of THEME_PRESETS) {
      expect(
        matchThemePreset({
          accentColor: preset.accentColor,
          bgColor: preset.bgColor,
          textColor: preset.textColor,
        })?.id
      ).toBe(preset.id);
    }
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(
      matchThemePreset({ accentColor: ' #346DDB ', bgColor: '#FFFFFF', textColor: '#1F2430' })?.id
    ).toBe('classic-light');
  });

  it('returns null for hand-tuned themes that predate presets', () => {
    expect(
      matchThemePreset({ accentColor: '#123456', bgColor: '#ffffff', textColor: '#1f2430' })
    ).toBeNull();
    expect(matchThemePreset({ accentColor: null, bgColor: undefined, textColor: '' })).toBeNull();
  });
});
