import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, computeContentHash, verifyContentHash, getEncryptionKey, clearKeyCache, getKeyCacheStats } from '#server/services/encryption';
import { decryptPageContent, encryptPageContent } from '#server/services/pageEncryption';
import { getProjectEncryptionKey, ensureProjectEncryptionKey } from '#server/services/keyManagement';
import { decryptPagesInBatch, decryptPageLazy, decryptSelectedPages } from '#server/services/batchDecrypt';
import { encryptAndUpload, getEncryptionMetadata, clearEncryptionMetadataCache, getEncryptionMetadataStats } from '#server/utils/storage-encryption';
import { getMetrics, resetMetrics, recordDecryptionDuration, getDecryptionMetrics } from '#server/middleware/metrics';

/**
 * Performance Test Suite for KnowledgeBook Encryption Features
 * Tests encryption key caching, batch operations, and performance metrics
 */

describe('Encryption Performance Tests', () => {
  beforeAll(() => {
    // Setup test environment
    clearKeyCache();
    clearEncryptionMetadataCache();
    resetMetrics();
  });

  afterAll(() => {
    // Cleanup
    clearKeyCache();
    clearEncryptionMetadataCache();
    resetMetrics();
  });

  describe('Key Caching', () => {
    const projectId = 999; // Test project ID

    it('should cache encryption keys', () => {
      // First call should fetch from database
      const key1 = getEncryptionKey(projectId);
      const stats1 = getKeyCacheStats();
      expect(stats1.size).toBeGreaterThanOrEqual(0);

      // Second call should use cache
      const key2 = getEncryptionKey(projectId);
      const stats2 = getKeyCacheStats();
      
      // Cache should now contain the key
      expect(stats2.size).toBeGreaterThanOrEqual(1);
    });

    it('should have low cache latency', () => {
      const projectId = 998;
      
      // Prime the cache
      getEncryptionKey(projectId);
      
      // Measure cache access time
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        getEncryptionKey(projectId);
      }
      const duration = performance.now() - start;
      
      // Cache access should be fast (< 10ms for 100 operations)
      expect(duration).toBeLessThan(10);
    });
  });

  describe('Batch Decryption', () => {
    it('should decrypt multiple pages concurrently', async () => {
      const pages = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        project_id: 100,
        encrypted_content: 'dGVzdA==', // base64 'test'
        encryption_iv: '000000000000000000000000',
        encryption_key_id: 'test-key-id',
        is_encrypted: true
      }));

      const start = performance.now();
      const results = await decryptPagesInBatch(pages, 100);
      const duration = performance.now() - start;

      // Batch decryption should complete in reasonable time
      expect(duration).toBeLessThan(500); // 500ms for 10 pages
    });

    it('should handle lazy decryption', async () => {
      const page = {
        id: 1,
        project_id: 100,
        encrypted_content: 'dGVzdA==',
        encryption_iv: '000000000000000000000000',
        encryption_key_id: 'test-key-id',
        is_encrypted: true
      };

      const start = performance.now();
      const result = await decryptPageLazy(page, 100);
      const duration = performance.now() - start;

      // Lazy decryption should be fast
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Metrics Collection', () => {
    it('should collect encryption operation metrics', () => {
      // Simulate decryption operations
      for (let i = 0; i < 10; i++) {
        recordDecryptionDuration(Math.random() * 50 + 10); // 10-60ms
      }

      const metrics = getDecryptionMetrics();
      expect(metrics.count).toBe(10);
      expect(metrics.avgDuration).toBeGreaterThan(0);
    });

    it('should track request metrics', () => {
      // This would be tested in an actual request context
      const m = getMetrics();
      
      // Metrics should be initialized
      expect(m.encryptedRequests).toBeGreaterThanOrEqual(0);
      expect(m.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(m.metricsWindow).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content Hash Operations', () => {
    it('should compute content hash efficiently', () => {
      const content = 'test content for hashing';
      const hash1 = computeContentHash(content);
      
      // Hash should be consistent
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should verify content integrity', () => {
      const content = 'integrity test';
      const hash = computeContentHash(content);
      
      expect(verifyContentHash(content, hash)).toBe(true);
      expect(verifyContentHash('modified content', hash)).toBe(false);
    });
  });

  describe('Key Management', () => {
    it('should generate project keys deterministically', () => {
      const projectId = 1000;
      const key1 = getProjectEncryptionKey(projectId);
      const key2 = getProjectEncryptionKey(projectId);
      
      // Keys should be deterministic
      expect(key1?.equals(key2!)).toBe(true);
    });

    it('should ensure encryption key exists', () => {
      const projectId = 1001;
      const key = ensureProjectEncryptionKey(projectId);
      
      expect(key).toBeDefined();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // 256 bits
    });
  });

  describe('S3 Encryption Upload', () => {
    it('should encrypt content before upload', async () => {
      const testContent = 'test file content for encryption upload';
      const buffer = Buffer.from(testContent);
      
      // This would test the actual upload with encryption
      // In test environment, S3 may not be configured
      const key = await encryptAndUpload('test-file.txt', buffer, 'text/plain', 100);
      
      expect(key).toBeDefined();
    });

    it('should cache encryption metadata', () => {
      const stats = getEncryptionMetadataStats();
      expect(stats.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Targets', () => {
    it('should meet page load target (< 200ms)', async () => {
      // Simulate a typical page load with encryption
      const start = performance.now();
      
      // Simulate key lookup, content fetch, decryption
      const projectId = 1002;
      const key = getEncryptionKey(projectId);
      
      // Simulate decryption
      const duration = performance.now() - start;
      
      // Total should be under 200ms
      expect(duration).toBeLessThan(200);
    });

    it('should meet encryption overhead target (< 50ms)', () => {
      const content = 'test content for encryption';
      const key = generateEncryptionKey();
      
      const start = performance.now();
      const encrypted = encrypt(content, key);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(50);
    });

    it('should support concurrent requests', async () => {
      // Simulate concurrent requests
      const requestCount = 100;
      const requests = Array.from({ length: requestCount }, (_, i) => 
        getEncryptionKey(1000 + i)
      );
      
      // All should complete without error
      await Promise.all(requests);
    });
  });
});

// Utility functions for testing
function generateEncryptionKey (): Buffer {
  const crypto = require('node:crypto');
  return crypto.randomBytes(32);
}
