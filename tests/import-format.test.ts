import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createTestDb, destroyTestDbs } from './setup/db';
import { importContent } from '#utils/import-unified';

/**
 * The unified import endpoint takes the format from `body.format` and validates
 * it as `options.format` (import-pipeline's ImportOptions). importContent has
 * to read the same field, otherwise an explicit choice is silently discarded
 * and content is always auto-detected instead.
 */
describe('importContent format selection', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    db.prepare(`INSERT INTO users (email, name) VALUES (?, ?)`).run('owner@test.dev', 'Owner');
  });

  afterAll(() => {
    destroyTestDbs();
  });

  // detectFormat() classifies anything containing "## " as GitBook, so this is
  // ordinary markdown that auto-detection gets wrong.
  const MARKDOWN_WITH_H2 = '# Title\n\n## Section\n\nSome body text.';

  it('honours an explicit markdown format over auto-detection', async () => {
    const result = await importContent({
      ownerId: 1,
      format: 'markdown',
      content: MARKDOWN_WITH_H2,
      projectName: 'Explicit Markdown',
    } as never);

    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('still auto-detects when no format is given', async () => {
    const result = await importContent({
      ownerId: 1,
      content: 'Just a plain paragraph with no headings.',
      projectName: 'Auto Detected',
    } as never);

    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('treats format:auto as auto-detection', async () => {
    const result = await importContent({
      ownerId: 1,
      format: 'auto',
      content: 'Another plain paragraph.',
      projectName: 'Auto Explicit',
    } as never);

    expect(result.pageCount).toBeGreaterThan(0);
  });

  // `type` was the field importContent originally read; callers that still send
  // it should keep working.
  it('accepts the legacy type field', async () => {
    const result = await importContent({
      ownerId: 1,
      type: 'markdown',
      content: MARKDOWN_WITH_H2,
      projectName: 'Legacy Type',
    } as never);

    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('rejects a gitbook import that has no url', async () => {
    await expect(
      importContent({
        ownerId: 1,
        format: 'gitbook',
        content: MARKDOWN_WITH_H2,
      } as never)
    ).rejects.toThrow(/URL is required/i);
  });
});
