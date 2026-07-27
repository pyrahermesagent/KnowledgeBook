import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  decryptPagesInBatch,
  decryptPageLazy,
  decryptSelectedPages,
  decryptPagesWithProgress,
  getEncryptedContentHash,
  clearHashCache,
  getHashCacheStats,
} from '#server/services/batchDecrypt';
import { encrypt, clearKeyCache } from '#server/services/encryption';
import { ensureProjectEncryptionKey } from '#server/services/keyManagement';
import { createTestDb, destroyTestDbs } from './setup/db';

const PROJECT_ID = 1;

/** Create a project row and provision its encryption key. */
function seedProject() {
  const db = createTestDb();
  clearKeyCache();
  db.prepare("INSERT INTO users (email) VALUES ('a@b.c')").run();
  db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p1', 'P1')").run();
  return db;
}

/** Insert a page, encrypting its content when asked. */
function insertPage(
  db: ReturnType<typeof createTestDb>,
  id: number,
  content: string,
  encrypted: boolean
) {
  if (!encrypted) {
    db.prepare(
      'INSERT INTO pages (id, project_id, slug, title, content) VALUES (?, ?, ?, ?, ?)'
    ).run(id, PROJECT_ID, `page-${id}`, `Page ${id}`, content);
    return { id, project_id: PROJECT_ID, content, is_encrypted: false } as any;
  }

  const key = ensureProjectEncryptionKey(PROJECT_ID);
  const { data, iv, keyId } = encrypt(content, key);

  db.prepare(
    `INSERT INTO pages (id, project_id, slug, title, content, encrypted_content, encryption_iv, encryption_key_id, is_encrypted)
     VALUES (?, ?, ?, ?, '', ?, ?, ?, 1)`
  ).run(id, PROJECT_ID, `page-${id}`, `Page ${id}`, data, iv, keyId);

  return {
    id,
    project_id: PROJECT_ID,
    content: '',
    encrypted_content: data,
    encryption_iv: iv,
    encryption_key_id: keyId,
    is_encrypted: true,
  } as any;
}

describe('decryptPagesInBatch', () => {
  beforeEach(() => seedProject());
  afterAll(() => destroyTestDbs());

  it('returns an empty list unchanged', async () => {
    await expect(decryptPagesInBatch([], PROJECT_ID)).resolves.toEqual([]);
  });

  it('decrypts every encrypted page', async () => {
    const db = seedProject();
    const pages = [
      insertPage(db, 1, 'first secret', true),
      insertPage(db, 2, 'second secret', true),
    ];

    const result = await decryptPagesInBatch(pages, PROJECT_ID);

    expect(result.map((p) => p.content)).toEqual(['first secret', 'second secret']);
  });

  it('passes plaintext pages through untouched', async () => {
    const db = seedProject();
    const pages = [insertPage(db, 1, 'public text', false)];

    const result = await decryptPagesInBatch(pages, PROJECT_ID);

    expect(result[0].content).toBe('public text');
  });

  it('handles a mix of encrypted and plaintext pages', async () => {
    const db = seedProject();
    const pages = [
      insertPage(db, 1, 'public text', false),
      insertPage(db, 2, 'private text', true),
    ];

    const result = await decryptPagesInBatch(pages, PROJECT_ID);

    expect(result.map((p) => p.content)).toEqual(['public text', 'private text']);
  });

  it('does not require a provisioned key when nothing is encrypted', async () => {
    const db = seedProject();
    // No key provisioned for project 2; looking one up would throw.
    db.prepare("INSERT INTO projects (owner_id, slug, name) VALUES (1, 'p2', 'P2')").run();
    const pages = [insertPage(db, 1, 'plain', false)];

    await expect(decryptPagesInBatch(pages, 2)).resolves.toHaveLength(1);
  });

  it('preserves page order', async () => {
    const db = seedProject();
    const pages = [
      insertPage(db, 1, 'one', true),
      insertPage(db, 2, 'two', false),
      insertPage(db, 3, 'three', true),
    ];

    const result = await decryptPagesInBatch(pages, PROJECT_ID);

    expect(result.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(result.map((p) => p.content)).toEqual(['one', 'two', 'three']);
  });
});

describe('decryptPageLazy', () => {
  beforeEach(() => seedProject());
  afterAll(() => destroyTestDbs());

  it('decrypts a single encrypted page', async () => {
    const db = seedProject();
    const page = insertPage(db, 1, 'lazy secret', true);

    const result = await decryptPageLazy(page, PROJECT_ID);

    expect(result.content).toBe('lazy secret');
  });

  it('returns a plaintext page as-is', async () => {
    const db = seedProject();
    const page = insertPage(db, 1, 'plain', false);

    const result = await decryptPageLazy(page, PROJECT_ID);

    expect(result).toBe(page);
  });
});

describe('decryptSelectedPages', () => {
  beforeEach(() => seedProject());
  afterAll(() => destroyTestDbs());

  it('decrypts only the requested pages', async () => {
    const db = seedProject();
    const pages = [insertPage(db, 1, 'wanted', true), insertPage(db, 2, 'not wanted', true)];

    const result = await decryptSelectedPages(pages, [1]);

    expect(result.find((p) => p.id === 1)!.content).toBe('wanted');
    // Page 2 stays encrypted (its plaintext column is empty).
    expect(result.find((p) => p.id === 2)!.content).toBe('');
  });

  it('returns the list untouched when nothing matches', async () => {
    const db = seedProject();
    const pages = [insertPage(db, 1, 'secret', true)];

    const result = await decryptSelectedPages(pages, [99]);

    expect(result).toEqual(pages);
  });
});

describe('decryptPagesWithProgress', () => {
  beforeEach(() => seedProject());
  afterAll(() => destroyTestDbs());

  it('decrypts across chunk boundaries and reports progress', async () => {
    const db = seedProject();
    const pages = Array.from({ length: 12 }, (_, i) =>
      insertPage(db, i + 1, `secret ${i + 1}`, true)
    );

    const progress: number[] = [];
    const result = await decryptPagesWithProgress(pages, PROJECT_ID, (done) => progress.push(done));

    expect(result).toHaveLength(12);
    expect(result[11].content).toBe('secret 12');
    // Chunk size is 10, so 12 pages report twice.
    expect(progress).toEqual([10, 12]);
  });
});

describe('getEncryptedContentHash', () => {
  beforeEach(() => clearHashCache());

  it('is stable for the same input', () => {
    const first = getEncryptedContentHash(1, 'ciphertext', 'iv');
    const second = getEncryptedContentHash(1, 'ciphertext', 'iv');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs when the ciphertext differs', () => {
    expect(getEncryptedContentHash(1, 'a', 'iv')).not.toBe(getEncryptedContentHash(1, 'b', 'iv'));
  });

  it('caches each distinct input once', () => {
    getEncryptedContentHash(1, 'a', 'iv');
    getEncryptedContentHash(1, 'a', 'iv');
    getEncryptedContentHash(2, 'b', 'iv');

    expect(getHashCacheStats().size).toBe(2);
  });

  it('clears the cache on request', () => {
    getEncryptedContentHash(1, 'a', 'iv');
    clearHashCache();

    expect(getHashCacheStats().size).toBe(0);
  });
});
