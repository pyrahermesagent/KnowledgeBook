# Code block UI: copy button, language selector, highlighting

**Date:** 2026-07-26
**Status:** Approved for planning

## Problem

Rendered code blocks in published documentation are inert. A reader cannot copy a
snippet, cannot see what language it is, and cannot correct a fence that was
authored with a missing or wrong language tag.

Three further problems sit underneath that:

1. `composables/useMarkdown.ts` imports the full `highlight.js` bundle — roughly
   1 MB minified, shipped to the client on every documentation page.
2. `components/MarkdownView.vue` renders one `v-html` blob, so there is nowhere
   to attach per-block UI.
3. `.prose pre` is hardcoded to `#0d1117`, and the dark theme sets `--bg` to
   exactly `#0d1117`. Code blocks are invisible in dark mode.

## Scope

Applies to `components/MarkdownView.vue`, which renders both published pages
(via `PublicDocs.vue`) and the dashboard editor's live preview.

`server/utils/static-export.ts` constructs its own separate `MarkdownIt`
instance and is **out of scope** — static and PDF export have no interactive
surface.

## Decisions

| Question                 | Decision                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Who selects the language | The reader, per block, re-tagging that one block            |
| Language list            | 36 eager (hljs `lib/common`) + 156 lazy on demand           |
| Selector UI              | Native `<select>` with `Common` / `All languages` optgroups |
| Selection persistence    | Ephemeral — resets on navigation                            |
| Test level               | Node-level units only; no new devDependencies               |

### Rationale

**Reader-side re-tagging** is an escape hatch for a mis-tagged fence, not a user
preference. It is therefore per-block and not persisted; carrying a choice
across pages would be surprising.

**hljs `lib/common`** is preferred over hand-picking ~20 languages: it is a
single import rather than a 20-line registration block, it is maintained
upstream, and it already covers bash, json, yaml, javascript, typescript,
python, go, rust, java, csharp, sql, xml, css, diff and markdown. Because
`common.js` registers onto the same core singleton, `hljs.registerLanguage()`
still works for the lazy tier.

**Native `<select>`** provides keyboard navigation, screen-reader semantics,
mobile pickers and type-ahead — which serves as the search over 192 entries —
for a fraction of the code a custom listbox would need for roving focus,
`aria-activedescendant` and dismiss handling.

## Architecture

### Constraint: Vite rejects bare-specifier dynamic imports

``import(`highlight.js/lib/languages/${name}`)`` fails at build time. Vite's
dynamic-import-vars transform throws _"Variable bare imports are not supported,
imports must start with ./ in the static part of the import"_
(`node_modules/vite/dist/node/chunks/node.js:28620`).

The lazy tier therefore requires a **static, generated loader map**.
`import.meta.glob` into `node_modules` was rejected as fragile across package
managers and under Nitro's separate server bundling.

### Components

```
composables/useMarkdown.ts        (modified)  render() + renderSegments()
composables/useHighlighter.ts     (new)       registry, lazy loading, highlight()
utils/hljs-loaders.generated.ts   (new)       192 static import thunks
scripts/generate-hljs-loaders.mjs (new)       regenerates the map
components/MarkdownView.vue       (modified)  v-for over segments
components/CodeBlock.vue          (new)       header, selector, copy button
assets/css/main.css               (modified)  token colors + block chrome
```

### `useMarkdown.renderSegments(source)`

Returns an ordered array:

```ts
type Segment = { kind: 'html'; html: string } | { kind: 'code'; code: string; lang: string };
```

It walks markdown-it's token stream, splitting on `fence` tokens and rendering
the intervening runs through `md.renderer.render()`.

**Nesting rule.** markdown-it's token stream is flat, so a fence inside a list
item or blockquote sits between `list_item_open` and `list_item_close`.
Splitting at that point emits unbalanced HTML. `renderSegments` tracks nesting
depth via `token.nesting` and splits **only on fences at depth 0**. Fences
nested inside a list or blockquote fall through to the existing
`<pre><code>` rendering with no header.

The existing `render()` export is unchanged so that the 15 tests in
`tests/markdown.test.ts` continue to pass untouched.

### `useHighlighter`

Module-scope singleton state, safe under SSR because the server only ever reads
the eager tier.

```ts
COMMON_LANGUAGES: string[]        // 36, from hljs.listLanguages() at init
ALL_LANGUAGES: string[]           // 192, keys of the generated loader map
registryVersion: Ref<number>      // bumped on each successful registration
ensureLanguage(name): Promise<boolean>
highlight(code, lang): string     // highlighted HTML, or escaped plain text
```

`ensureLanguage` returns `true` immediately for an already-registered language —
which short-circuits all 36 of the eager tier — otherwise looks up the loader,
imports it, calls `hljs.registerLanguage`, and bumps `registryVersion` so every
mounted `CodeBlock` re-highlights. It returns `false` for an unknown name or a
failed import.

`normalize(name)` lowercases and trims, then resolves hljs aliases to their
canonical name (`js` → `javascript`) via `hljs.getLanguage(name)?.name`, so the
value always matches an `<option>`. A language outside the 192 resolves to
`plaintext`.

`highlight` never throws: an unregistered or failing language yields
HTML-escaped plain text.

### `utils/hljs-loaders.generated.ts`

```ts
export const HLJS_LANGUAGE_LOADERS: Record<string, () => Promise<{ default: LanguageFn }>> = {
  erlang: () => import('highlight.js/lib/languages/erlang'),
  // … 191 more
};
```

Generated by `scripts/generate-hljs-loaders.mjs` from the installed
`highlight.js/lib/languages/` directory, excluding the legacy `*.js.js` alias
files, and committed. A test asserts the map's keys match that directory so a
hljs version bump that adds languages fails CI rather than drifting silently.

### `CodeBlock.vue`

Props: `code: string`, `lang: string`.

State:

```ts
const selected = ref<string | null>(null); // null = use the authored lang
const effectiveLang = computed(() => selected.value ?? normalize(props.lang));
const highlighted = computed(() => {
  registryVersion.value; // re-run when a grammar registers
  return highlight(props.code, effectiveLang.value);
});
```

Header bar above the `<pre>` containing the language `<select>` and the copy
button. The `<select>` lists the 36 common languages under a `Common` optgroup
and the remaining 156 under `All languages`, so no entry appears twice.

**Copy** writes `props.code` — the raw source, never the highlighted markup and
never the language label — via `navigator.clipboard.writeText`, falling back to
a hidden textarea plus `document.execCommand('copy')` for non-secure contexts.
Shows a `Copied` or `Failed` state, cleared after 2 s.

**Lazy selection** shows a pending state on the control while the grammar
imports. On failure the selection reverts to its previous value and the failure
is surfaced, rather than silently rendering plaintext.

### CSS

- Extend the token subset at `main.css:200-229` beyond the current six rules.
  Opening up 192 languages exposes classes that currently inherit the plain
  foreground — most visibly `diff`, where additions and deletions render
  identically. Add `hljs-meta`, `hljs-tag`, `hljs-section`, `hljs-symbol`,
  `hljs-params`, `hljs-addition`, `hljs-deletion`.
- Style the header bar to sit flush on top of the `<pre>`, sharing its radius.
- Style the `<select>` with `appearance: none` plus a chevron so it reads as a
  label rather than a form control.
- **Fix the dark-mode bug:** give the code block a border so it remains
  delineated when `--bg` equals the block's `#0d1117` background.

## Testing

Node environment, no new dependencies. Logic lives in `renderSegments` and
`useHighlighter` precisely so it is testable this way; `CodeBlock.vue` remains a
thin wiring layer.

`tests/markdown.test.ts` (extended)

- splits a top-level fence into a `code` segment carrying raw code and lang
- does **not** split a fence nested in a list item
- does **not** split a fence nested in a blockquote
- a fence with no language yields `lang: ''`
- consecutive fences yield separate segments
- html segments preserve the content surrounding a fence
- existing `render()` tests still pass

`tests/highlighter.test.ts` (new)

- the 36 common languages are registered at init
- `ensureLanguage` registers a lazy grammar and returns `true`
- `ensureLanguage` returns `false` for an unknown name
- a second call for an already-registered language resolves without re-importing
- `registryVersion` increments on a successful registration
- `highlight` returns escaped plain text for an unregistered language
- the generated loader map's keys match `highlight.js/lib/languages/`

## Out of scope

- Persisting a reader's language choice across pages or sessions
- Multi-language tabbed code groups
- An author-facing language picker in the dashboard editor toolbar
- Line numbers, line highlighting, or word wrap toggles
- Changing `server/utils/static-export.ts`
