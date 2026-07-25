import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

// Raw HTML in documents stays disabled so published pages can't inject scripts.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        /* fall through to plain rendering */
      }
    }
    return '';
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

export function useMarkdown() {
  return { render: (source: string) => md.render(source ?? '') };
}
