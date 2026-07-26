import { describe, it, expect } from 'vitest';
import { useMarkdown } from '../composables/useMarkdown';

describe('useMarkdown', () => {
  const { render } = useMarkdown();

  it('renders basic markdown', () => {
    const result = render('# Hello World');
    expect(result).toContain('<h1');
    expect(result).toContain('Hello World');
  });

  it('renders bold and italic text', () => {
    const result = render('**bold** and *italic*');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  it('renders code blocks with syntax highlighting', () => {
    const result = render('```javascript\nconst x = 1;\n```');
    expect(result).toContain('<code');
    expect(result).toContain('javascript');
  });

  it('handles empty input', () => {
    const result = render('');
    expect(result).toBe('');
  });

  it('handles undefined input', () => {
    const result = render(undefined as unknown as string);
    expect(result).toBe('');
  });

  it('renders paragraphs', () => {
    const result = render('Some text\n\nMore text');
    expect(result).toContain('<p>Some text</p>');
    expect(result).toContain('<p>More text</p>');
  });
});

describe('useMarkdown images', () => {
  const { render } = useMarkdown();

  it('renders a plain image', () => {
    const result = render('![a cat](/cat.png)');
    expect(result).toContain('src="/cat.png"');
    expect(result).toContain('alt="a cat"');
  });

  it('renders a sized image with its size class', () => {
    const result = render('![a cat](/cat.png){size=small}');
    expect(result).toContain('src="/cat.png"');
    expect(result).toContain('class="image-size-small"');
  });

  it.each(['small', 'medium', 'large'])('supports size=%s', (size) => {
    const result = render(`![a cat](/cat.png){size=${size}}`);
    expect(result).toContain(`class="image-size-${size}"`);
  });

  it('keeps the text surrounding an image', () => {
    const result = render('Before ![a cat](/cat.png) after.');
    expect(result).toContain('Before');
    expect(result).toContain('after.');
    expect(result).toContain('src="/cat.png"');
  });

  it('keeps text following a sized image', () => {
    const result = render('Before ![a cat](/cat.png){size=large} after.');
    expect(result).toContain('Before');
    expect(result).toContain('after.');
    expect(result).toContain('class="image-size-large"');
  });

  it('renders each image exactly once', () => {
    const result = render('![one](/1.png) and ![two](/2.png)');
    expect(result.match(/<img/g)).toHaveLength(2);
    expect(result).toContain('src="/1.png"');
    expect(result).toContain('src="/2.png"');
  });

  it('does not let a link be swallowed by the image rule', () => {
    const result = render('See [the docs](https://example.com) please.');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('the docs');
    expect(result).toContain('please.');
  });

  /**
   * The renderer builds the <img> tag by string interpolation, so attribute
   * values have to be escaped. html:false disables raw HTML precisely so that
   * published pages cannot inject scripts.
   */
  it('escapes quotes in alt text instead of injecting attributes', () => {
    const result = render('![" onerror="alert(1)](/cat.png){size=small}');
    expect(result).not.toContain('onerror="alert(1)"');
    expect(result).toContain('&quot;');
  });

  it('escapes quotes in the image src', () => {
    const result = render('![cat](/cat.png" onerror="alert(1)){size=small}');
    expect(result).not.toContain('onerror="alert(1)"');
  });
});
