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
