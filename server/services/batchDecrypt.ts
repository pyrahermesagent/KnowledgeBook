import { type Page } from '#types';
import { decryptPageContent } from '#server/services/pageEncryption';
import { getEncryptionKey } from '#server/services/encryption';

/**
 * Page interface extension for decryption
 */
interface DecryptablePage extends Page {
  content?: string;
  is_encrypted?: boolean;
}

/**
 * Decrypt multiple pages in parallel
 * Uses Promise.all for concurrent decryption operations
 *
 * Performance: O(n) parallel operations instead of O(n) sequential
 */
export async function decryptPagesInBatch(
  pages: DecryptablePage[],
  projectId: number
): Promise<DecryptablePage[]> {
  if (pages.length === 0) {
    return pages;
  }

  // Get encryption key once (cached)
  const projectKey = getEncryptionKey(projectId);

  // Decrypt all pages in parallel
  const decryptPromises = pages.map((page) => {
    if (!page.is_encrypted || !page.encrypted_content || !page.encryption_iv) {
      return Promise.resolve(page);
    }

    return decryptPageContent(page).then((content) => ({
      ...page,
      content,
    }));
  });

  const decryptedPages = await Promise.all(decryptPromises);

  return decryptedPages;
}

/**
 * Lazy loading decryption strategy
 * Only decrypt content when page is actually viewed
 * Show encrypted content hash in list view
 *
 * This reduces initial load time and bandwidth
 */

// In-memory cache for encrypted content hashes
const contentHashCache = new Map<string, string>();

/**
 * Get hash of encrypted content without decrypting
 */
export function getEncryptedContentHash(
  pageId: number,
  encryptedContent: string,
  encryptionIv: string
): string {
  const cacheKey = `${pageId}:${encryptedContent}:${encryptionIv}`;

  if (contentHashCache.has(cacheKey)) {
    return contentHashCache.get(cacheKey)!;
  }

  // Compute hash for integrity verification
  const hash = computeHash(encryptedContent, encryptionIv);
  contentHashCache.set(cacheKey, hash);

  return hash;
}

/**
 * Compute content hash for verification
 */
function computeHash(encryptedContent: string, encryptionIv: string): string {
  const crypto = require('node:crypto');
  return crypto
    .createHash('sha256')
    .update(encryptedContent + encryptionIv)
    .digest('hex');
}

/**
 * Clear hash cache (for testing)
 */
export function clearHashCache(): void {
  contentHashCache.clear();
}

/**
 * Get hash cache stats
 */
export function getHashCacheStats(): { size: number } {
  return { size: contentHashCache.size };
}

/**
 * Decrypt a single page (lazy loading)
 * Only decrypt when page is actually opened
 */
export async function decryptPageLazy(
  page: DecryptablePage,
  projectId: number
): Promise<DecryptablePage> {
  if (!page.is_encrypted || !page.encrypted_content || !page.encryption_iv) {
    return page;
  }

  const content = await decryptPageContent(page);
  return {
    ...page,
    content,
  };
}

/**
 * Decrypt pages selectively (only those requested)
 * Useful for paginated views
 */
export async function decryptSelectedPages(
  pages: DecryptablePage[],
  requestedPageIds: number[]
): Promise<DecryptablePage[]> {
  const pagesToDecrypt = pages.filter(
    (page) => requestedPageIds.includes(page.id) && page.is_encrypted
  );

  if (pagesToDecrypt.length === 0) {
    return pages;
  }

  // Decrypt only requested pages
  const decrypted = await decryptPagesInBatch(pagesToDecrypt, pagesToDecrypt[0].project_id);

  // Merge back into original list
  return pages.map((page) => {
    const decryptedPage = decrypted.find((p) => p.id === page.id);
    return decryptedPage || page;
  });
}

/**
 * Batch decrypt with progress tracking
 * Useful for large operations
 */
export async function decryptPagesWithProgress(
  pages: DecryptablePage[],
  projectId: number,
  onProgress?: (completed: number, total: number) => void
): Promise<DecryptablePage[]> {
  const total = pages.length;
  const results: DecryptablePage[] = [];

  // Process in chunks of 10 for concurrency control
  const chunkSize = 10;

  for (let i = 0; i < pages.length; i += chunkSize) {
    const chunk = pages.slice(i, i + chunkSize);
    const chunkResults = await decryptPagesInBatch(chunk, projectId);

    results.push(...chunkResults);

    if (onProgress) {
      onProgress(results.length, total);
    }
  }

  return results;
}
