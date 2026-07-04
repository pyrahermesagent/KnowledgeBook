import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

// Raw HTML in documents stays disabled so published pages can't inject scripts.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch { /* fall through to plain rendering */ }
    }
    return ''
  }
})

export function useMarkdown () {
  return { render: (source: string) => md.render(source ?? '') }
}
