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

// Image size parser: ![alt](url){size=small|medium|large}
function imageSizePlugin(state: any) {
  let pos = 0;
  const maxPos = state.src.length;

  while (pos < maxPos) {
    // Check for image with size: ![alt](url){size=small|medium|large}
    const imageWithSizeRegex = /^!\[(.*?)\]\((.*?)\)\{size\s*=\s*(small|medium|large)\}/;
    const match = state.src.slice(pos).match(imageWithSizeRegex);

    if (match) {
      const token = state.push('image', 'img', 0);
      token.attrs = [
        ['src', match[2]],
        ['alt', match[1]],
        ['class', `image-size-${match[3]}`],
      ];
      token.markup = 'image-size';
      token.map = [state.line, state.line];
      pos += match[0].length;
      state.pos = pos;
      continue;
    }

    // Check for regular image: ![alt](url)
    const imageRegex = /^!\[(.*?)\]\((.*?)\)/;
    const imageMatch = state.src.slice(pos).match(imageRegex);

    if (imageMatch) {
      const token = state.push('image', 'img', 0);
      token.attrs = [
        ['src', imageMatch[2]],
        ['alt', imageMatch[1]],
      ];
      token.markup = '![]';
      token.map = [state.line, state.line];
      pos += imageMatch[0].length;
      state.pos = pos;
      continue;
    }

    // For non-matching text, advance by one character
    pos++;
    state.pos = pos;
  }
  return true;
}

md.inline.ruler.before('link', 'image-size', imageSizePlugin);

// Render images with class attribute - capture originalImage inside md.use()
// so default rules have been loaded
md.use(() => {
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const src = token.attrs?.find((a: any[]) => a[0] === 'src')?.[1] ?? '';
    const alt = token.attrs?.find((a: any[]) => a[0] === 'alt')?.[1] ?? '';
    const cls = token.attrs?.find((a: any[]) => a[0] === 'class')?.[1] ?? '';

    if (cls) {
      return `<img src="${src}" alt="${alt}" class="${cls}" />`;
    }
    return originalImage(tokens, idx);
  };
});

export function useMarkdown() {
  return { render: (source: string) => md.render(source ?? '') };
}
