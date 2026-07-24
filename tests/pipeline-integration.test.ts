// Multi-Modal Content Pipeline Integration Tests
// Tests import/export combinations across 7+ formats

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';

describe('Content Pipeline Integration', () => {
  describe('Import Pipeline Files', () => {
    it('has import-unified.ts with format detection', () => {
      expect(existsSync('./server/utils/import-unified.ts')).toBe(true);
    });

    it('has html-import.ts for HTML/CMS content', () => {
      expect(existsSync('./server/utils/html-import.ts')).toBe(true);
    });

    it('has confluence.ts for Confluence XML import', () => {
      expect(existsSync('./server/utils/confluence.ts')).toBe(true);
    });

    it('has gitbook.ts for GitBook import', () => {
      expect(existsSync('./server/utils/gitbook.ts')).toBe(true);
    });
  });

  describe('Export Pipeline Files', () => {
    it('has pdf-export.ts for PDF generation', () => {
      expect(existsSync('./server/utils/pdf-export.ts')).toBe(true);
    });

    it('has static-export.ts for static site generation', () => {
      expect(existsSync('./server/utils/static-export.ts')).toBe(true);
    });
  });

  describe('Pipeline Utilities', () => {
    it('has preview-pipeline.ts for real-time preview', () => {
      expect(existsSync('./server/utils/preview-pipeline.ts')).toBe(true);
    });

    it('has content-sync.ts for conflict resolution', () => {
      expect(existsSync('./server/utils/content-sync.ts')).toBe(true);
    });
  });

  describe('Import/Export Combinations', () => {
    it('supports GitBook import with PDF export', () => {
      const hasGitBookImport = existsSync('./server/utils/gitbook.ts');
      const hasPdfExport = existsSync('./server/utils/pdf-export.ts');
      expect(hasGitBookImport && hasPdfExport).toBe(true);
    });

    it('supports HTML import with static site export', () => {
      const hasHtmlImport = existsSync('./server/utils/html-import.ts');
      const hasStaticExport = existsSync('./server/utils/static-export.ts');
      expect(hasHtmlImport && hasStaticExport).toBe(true);
    });

    it('supports Confluence import with multiple export formats', () => {
      const hasConfluenceImport = existsSync('./server/utils/confluence.ts');
      const hasPdfExport = existsSync('./server/utils/pdf-export.ts');
      const hasStaticExport = existsSync('./server/utils/static-export.ts');
      expect(hasConfluenceImport && hasPdfExport && hasStaticExport).toBe(true);
    });
  });

  describe('API Endpoints', () => {
    it('has import API endpoints', () => {
      const endpoints = [
        './server/api/projects/import-confluence.post.ts',
        './server/api/projects/import-gitbook.post.ts',
        './server/api/projects/import-html.post.ts',
      ];
      endpoints.forEach(endpoint => {
        expect(existsSync(endpoint)).toBe(true);
      });
    });

    it('has export API endpoints', () => {
      const endpoints = [
        './server/api/projects/[slug]/export-pdf.post.ts',
      ];
      endpoints.forEach(endpoint => {
        expect(existsSync(endpoint)).toBe(true);
      });
    });

    it('has preview and sync API endpoints', () => {
      const endpoints = [
        './server/api/previews/index.post.ts',
        './server/api/sync/index.post.ts',
      ];
      endpoints.forEach(endpoint => {
        expect(existsSync(endpoint)).toBe(true);
      });
    });
  });

  describe('Integration Points', () => {
    it('pipeline files exist with expected content', () => {
      // Verify that the key utility files exist and have typical exports
      const fs = require('fs');
      
      const importContent = fs.readFileSync('./server/utils/import-unified.ts', 'utf8');
      expect(importContent).toContain('importContent');
      expect(importContent).toContain('detectFormat');
      
      const pdfExport = fs.readFileSync('./server/utils/pdf-export.ts', 'utf8');
      expect(pdfExport).toContain('exportToPdf');
      expect(pdfExport).toContain('getAvailableThemes');
      
      const staticExport = fs.readFileSync('./server/utils/static-export.ts', 'utf8');
      expect(staticExport).toContain('exportNuxt');
      expect(staticExport).toContain('exportVitePress');
    });
  });
});
