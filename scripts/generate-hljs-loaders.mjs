/**
 * Regenerates utils/hljs-loaders.generated.ts from the installed highlight.js.
 *
 * Every grammar needs its own statically-written import() call: Vite's
 * dynamic-import-vars transform rejects `import(`highlight.js/lib/languages/${x}`)`
 * with "Variable bare imports are not supported", so the map cannot be built at
 * runtime. Run `node scripts/generate-hljs-loaders.mjs` after bumping
 * highlight.js; tests/highlighter.test.ts fails when the map drifts.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import hljs from 'highlight.js/lib/common';

const LANGUAGES_DIR = fileURLToPath(
  new URL('../node_modules/highlight.js/lib/languages/', import.meta.url)
);
const OUTPUT = fileURLToPath(new URL('../utils/hljs-loaders.generated.ts', import.meta.url));

/** Canonical grammar names, minus highlight.js' legacy `<name>.js.js` aliases. */
export function listGrammarNames(dir = LANGUAGES_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js') && !file.endsWith('.js.js'))
    .map((file) => file.slice(0, -'.js'.length))
    .sort();
}

// Grammars in lib/common are already bundled eagerly, and ensureLanguage
// short-circuits on anything registered. Emitting loaders for them too made
// Rollup write 36 standalone chunks that nothing can ever fetch.
const eager = new Set(hljs.listLanguages());
const names = listGrammarNames().filter((name) => !eager.has(name));

/** Matches prettier's `quoteProps: as-needed`, so the output is format-clean. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name) => (IDENTIFIER.test(name) ? name : `'${name}'`);

const entries = names
  .map((name) => `  ${key(name)}: () => import('highlight.js/lib/languages/${name}'),`)
  .join('\n');

writeFileSync(
  OUTPUT,
  `// GENERATED FILE - do not edit by hand.
// Run \`node scripts/generate-hljs-loaders.mjs\` to regenerate.
import type { LanguageFn } from 'highlight.js';

/**
 * Lazy loader per highlight.js grammar *outside* lib/common, written out
 * statically because Vite cannot analyse a dynamic import built from a bare
 * specifier plus a variable. Each entry becomes its own chunk, so only the
 * grammars a reader actually selects are ever fetched.
 */
export const HLJS_LANGUAGE_LOADERS: Record<string, () => Promise<{ default: LanguageFn }>> = {
${entries}
};
`,
  'utf8'
);

console.log(
  `Wrote ${names.length} lazy loaders to utils/hljs-loaders.generated.ts ` +
    `(${eager.size} eager grammars excluded)`
);
