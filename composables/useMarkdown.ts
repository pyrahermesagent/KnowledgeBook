import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { highlightCode, normalizeLanguage, PLAINTEXT } from './useHighlighter';

// Raw HTML in documents stays disabled so published pages can't inject scripts.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string) {
    const language = normalizeLanguage(lang);
    // Returning '' lets markdown-it escape and wrap the code itself.
    if (language === PLAINTEXT) return '';
    return highlightCode(code, language);
  },
});

const SIZE_SUFFIX = /^\{size\s*=\s*(small|medium|large)\}/;

/**
 * Adds the `{size=small|medium|large}` suffix to markdown's image syntax:
 * `![alt](url){size=large}`.
 *
 * This only handles the suffix and lets markdown-it parse the image itself. An
 * inline rule is invoked at `state.pos` and must report whether it consumed
 * anything there — an earlier version instead rescanned the whole source from
 * index 0 and always returned true, which told the tokenizer the rest of the
 * line was consumed. Everything after the first `[` or `!` on a line was
 * dropped, so plain links lost their paragraph too.
 */
function imageSizePlugin(state: any, silent: boolean): boolean {
  const match = SIZE_SUFFIX.exec(state.src.slice(state.pos, state.posMax));
  if (!match) return false;

  // Only a suffix directly after an image counts; `{size=small}` on its own is
  // ordinary text.
  const previous = state.tokens[state.tokens.length - 1];
  if (!previous || previous.type !== 'image') return false;

  if (!silent) {
    previous.attrJoin('class', `image-size-${match[1]}`);
  }
  state.pos += match[0].length;
  return true;
}

md.inline.ruler.after('image', 'image-size', imageSizePlugin);

export interface HtmlSegment {
  kind: 'html';
  html: string;
}

export interface CodeSegment {
  kind: 'code';
  code: string;
  lang: string;
}

export type Segment = HtmlSegment | CodeSegment;

/**
 * Splits rendered markdown into HTML runs and standalone code blocks, so the
 * latter can be handed to a component instead of an opaque v-html blob.
 *
 * Only fences at nesting depth 0 are split out. markdown-it's token stream is
 * flat, so a fence inside a list item sits between `list_item_open` and
 * `list_item_close`; cutting there would render each side separately and emit
 * unbalanced tags. Nested fences stay in their HTML run and keep the plain
 * <pre><code> rendering.
 */
function renderSegments(source: string): Segment[] {
  const src = source ?? '';
  if (!src) return [];

  const env = {};
  const segments: Segment[] = [];
  let run: Token[] = [];
  let depth = 0;

  const flushRun = () => {
    if (!run.length) return;
    const html = md.renderer.render(run, md.options, env);
    if (html) segments.push({ kind: 'html', html });
    run = [];
  };

  for (const token of md.parse(src, env)) {
    if (token.type === 'fence' && depth === 0) {
      flushRun();
      segments.push({
        kind: 'code',
        code: token.content,
        // The info string may carry more than the language (```js title=x).
        lang: (token.info ?? '').trim().split(/\s+/)[0] ?? '',
      });
      continue;
    }
    run.push(token);
    depth += token.nesting;
  }

  flushRun();
  return segments;
}

export function useMarkdown() {
  return { render: (source: string) => md.render(source ?? ''), renderSegments };
}
