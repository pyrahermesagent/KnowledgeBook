import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ALL_LANGUAGES,
  COMMON_LANGUAGES,
  LAZY_LANGUAGES,
  ensureLanguage,
  escapeHtml,
  highlightCode,
  normalizeLanguage,
  registryVersion,
} from '../composables/useHighlighter';
import { HLJS_LANGUAGE_LOADERS } from '../utils/hljs-loaders.generated';

describe('language registry', () => {
  it('preregisters the common languages', () => {
    expect(COMMON_LANGUAGES).toContain('javascript');
    expect(COMMON_LANGUAGES).toContain('python');
    expect(COMMON_LANGUAGES).toContain('bash');
    expect(COMMON_LANGUAGES.length).toBeGreaterThanOrEqual(30);
  });

  it('lists every shipped grammar', () => {
    expect(ALL_LANGUAGES.length).toBeGreaterThan(COMMON_LANGUAGES.length);
    expect(ALL_LANGUAGES).toContain('erlang');
  });

  it('splits lazy languages from common ones so neither list repeats an entry', () => {
    const overlap = LAZY_LANGUAGES.filter((lang) => COMMON_LANGUAGES.includes(lang));
    expect(overlap).toEqual([]);
    expect(LAZY_LANGUAGES.length + COMMON_LANGUAGES.length).toBe(ALL_LANGUAGES.length);
  });

  /**
   * The loader map is generated, so nothing stops a highlight.js bump from
   * adding grammars the picker would never offer. Fail here instead.
   */
  it('covers every grammar highlight.js ships across the two tiers', () => {
    const dir = fileURLToPath(
      new URL('../node_modules/highlight.js/lib/languages/', import.meta.url)
    );
    const shipped = readdirSync(dir)
      .filter((file) => file.endsWith('.js') && !file.endsWith('.js.js'))
      .map((file) => file.slice(0, -3))
      .sort();

    expect(ALL_LANGUAGES).toEqual(shipped);
  });

  /**
   * A loader for an eagerly bundled grammar is dead weight: Rollup emits a
   * chunk for it that ensureLanguage can never request, because the language is
   * already registered.
   */
  it('emits no loader for an eagerly bundled grammar', () => {
    const duplicated = COMMON_LANGUAGES.filter((lang) =>
      Object.prototype.hasOwnProperty.call(HLJS_LANGUAGE_LOADERS, lang)
    );
    expect(duplicated).toEqual([]);
  });
});

describe('normalizeLanguage', () => {
  it('resolves aliases to the canonical registration key', () => {
    expect(normalizeLanguage('js')).toBe('javascript');
    expect(normalizeLanguage('py')).toBe('python');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeLanguage('  JavaScript ')).toBe('javascript');
  });

  it('keeps a known but unregistered grammar name', () => {
    expect(normalizeLanguage('haskell')).toBe('haskell');
  });

  it('falls back to plaintext for unknown, empty and nullish tags', () => {
    expect(normalizeLanguage('not-a-language')).toBe('plaintext');
    expect(normalizeLanguage('')).toBe('plaintext');
    expect(normalizeLanguage(undefined)).toBe('plaintext');
    expect(normalizeLanguage(null)).toBe('plaintext');
  });
});

describe('ensureLanguage', () => {
  it('resolves true without loading for an already registered language', async () => {
    const before = registryVersion.value;
    await expect(ensureLanguage('javascript')).resolves.toBe(true);
    expect(registryVersion.value).toBe(before);
  });

  it('loads a lazy grammar and bumps the registry version', async () => {
    const before = registryVersion.value;
    await expect(ensureLanguage('erlang')).resolves.toBe(true);
    expect(registryVersion.value).toBe(before + 1);
    expect(highlightCode('-module(x).', 'erlang')).toContain('hljs-');
  });

  it('does not reload a grammar it already loaded', async () => {
    await ensureLanguage('elixir');
    const after = registryVersion.value;
    await expect(ensureLanguage('elixir')).resolves.toBe(true);
    expect(registryVersion.value).toBe(after);
  });

  it('registers the alias of a lazily loaded grammar', async () => {
    await ensureLanguage('haskell');
    expect(normalizeLanguage('hs')).toBe('haskell');
  });

  it('resolves false for an unknown language', async () => {
    await expect(ensureLanguage('not-a-language')).resolves.toBe(false);
    await expect(ensureLanguage('')).resolves.toBe(false);
  });

  it('shares one import between concurrent callers', async () => {
    const before = registryVersion.value;
    const results = await Promise.all([ensureLanguage('scala'), ensureLanguage('scala')]);
    expect(results).toEqual([true, true]);
    expect(registryVersion.value).toBe(before + 1);
  });
});

describe('highlightCode', () => {
  it('emits hljs token markup for a registered language', () => {
    const result = highlightCode('const x = 1;', 'javascript');
    expect(result).toContain('hljs-keyword');
  });

  it('escapes plain text for an unregistered language', () => {
    const result = highlightCode('<script>alert(1)</script>', 'not-a-language');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes plaintext rather than highlighting it', () => {
    expect(highlightCode('a < b', 'plaintext')).toBe('a &lt; b');
  });

  it('handles empty and nullish input', () => {
    expect(highlightCode('', 'javascript')).toBe('');
    expect(highlightCode('x', undefined)).toBe('x');
  });
});

describe('escapeHtml', () => {
  it('escapes every character that could break out of a text node', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
