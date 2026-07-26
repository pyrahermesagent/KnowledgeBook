import { ref } from 'vue';
// `lib/common` preregisters the ~36 grammars documentation actually uses onto
// the same core singleton `registerLanguage` writes to, so the lazy tier below
// extends this instance. Importing 'highlight.js' instead would pull all 192
// grammars (~1MB) into the client bundle of every docs page.
import hljs from 'highlight.js/lib/common';
import { HLJS_LANGUAGE_LOADERS } from '../utils/hljs-loaders.generated';

export const PLAINTEXT = 'plaintext';

/** Registered up front, available without a network round trip. */
export const COMMON_LANGUAGES: readonly string[] = hljs.listLanguages().slice().sort();

/** Everything else highlight.js ships, fetched only when selected. */
export const LAZY_LANGUAGES: readonly string[] = Object.keys(HLJS_LANGUAGE_LOADERS).sort();

/** Every grammar highlight.js ships. The two tiers never overlap. */
export const ALL_LANGUAGES: readonly string[] = [...COMMON_LANGUAGES, ...LAZY_LANGUAGES].sort();

/**
 * Bumped whenever a grammar registers. Highlight results are computed, not
 * stored, so mounted blocks need this to recompute once a lazy grammar lands.
 */
export const registryVersion = ref(0);

/**
 * Alias to canonical registration key (`js` -> `javascript`).
 *
 * highlight.js exposes aliases only on a *registered* grammar, and
 * `getLanguage(x).name` is the display name ("JavaScript"), not the key, so
 * neither can be used directly to resolve a fence tag to an <option> value.
 */
const aliasToCanonical = new Map<string, string>();

function indexRegisteredLanguages(): void {
  for (const key of hljs.listLanguages()) {
    aliasToCanonical.set(key, key);
    for (const alias of hljs.getLanguage(key)?.aliases ?? []) {
      aliasToCanonical.set(alias.toLowerCase(), key);
    }
  }
}

indexRegisteredLanguages();

/** In-flight imports, so N blocks selecting one language import it once. */
const inFlight = new Map<string, Promise<boolean>>();

function hasLoader(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(HLJS_LANGUAGE_LOADERS, key);
}

/**
 * Resolves a fence tag or picker value to a canonical grammar key.
 * Unknown tags become `plaintext` rather than throwing, so a typo in authored
 * markdown degrades to unhighlighted code.
 */
export function normalizeLanguage(name: string | undefined | null): string {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return PLAINTEXT;
  return aliasToCanonical.get(key) ?? (hasLoader(key) ? key : PLAINTEXT);
}

/**
 * Registers a grammar if it isn't already, importing it on demand.
 * Resolves false for an unknown name or a failed import; callers surface that
 * rather than silently falling back to plaintext.
 */
export async function ensureLanguage(name: string | undefined | null): Promise<boolean> {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return false;

  const canonical = aliasToCanonical.get(key);
  if (canonical) return true;
  if (!hasLoader(key)) return false;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const load = (async () => {
    try {
      const grammar = await HLJS_LANGUAGE_LOADERS[key]();
      hljs.registerLanguage(key, grammar.default);
      indexRegisteredLanguages();
      registryVersion.value += 1;
      return true;
    } catch {
      // Dropped from the cache so a later attempt can retry a transient
      // chunk-load failure.
      inFlight.delete(key);
      return false;
    }
  })();

  inFlight.set(key, load);
  return load;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Highlights code, returning HTML-escaped plain text when the grammar is
 * unavailable. Never throws: `highlight()` is called from render paths where a
 * malformed snippet must not take down the page.
 */
export function highlightCode(code: string, lang: string | undefined | null): string {
  const source = code ?? '';
  const key = (lang ?? '').trim().toLowerCase();

  if (key && key !== PLAINTEXT && hljs.getLanguage(key)) {
    try {
      return hljs.highlight(source, { language: key, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain text */
    }
  }
  return escapeHtml(source);
}

export function useHighlighter() {
  return {
    ALL_LANGUAGES,
    COMMON_LANGUAGES,
    LAZY_LANGUAGES,
    registryVersion,
    normalizeLanguage,
    ensureLanguage,
    highlightCode,
  };
}
