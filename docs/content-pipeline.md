# Multi-Modal Content Pipeline Documentation

## Overview

The KnowledgeBook content pipeline enables importing from 7+ source formats and exporting to 5+ output formats, with preview and sync capabilities for collaborative workflows.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Multi-Modal Content Pipeline                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Import    │     │  Preview    │     │    Export   │       │
│  │  Pipeline   │────>│  System     │────>│  Pipeline   │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                       │                │             │
│  ┌──────┴──────┐     ┌─────────┴─────────┐     ┌┴────────────┐  │
│  │  Content    │     │  Real-time      │     │  Multiple    │  │
│  │   Sync      │     │  Preview with   │     │  Output      │  │
│  └─────────────┘     │  Theme Switching│     │  Formats     │  │
│                      └─────────────────┘     └──────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Import Pipeline

Supports 7+ source formats with auto-detection:

### Supported Formats

| Format | Description | Example Use Case |
|--------|-------------|------------------|
| GitBook | GitBook.io published sites | Import published documentation |
| Confluence | Atlassian Confluence XML export | Enterprise knowledge base migration |
| HTML | Static HTML/CMS exports | WordPress, MediaWiki migration |
| Markdown | Plain markdown files | Developer documentation |
| CSV | Structured data export | Data-driven content imports |
| PDF | PDF document parsing | Legacy document digitization |
| EPUB | E-book format | Book-to-web migration |

### API Endpoints

#### Import Content

```typescript
POST /api/projects/import-confluence
POST /api/projects/import-gitbook
POST /api/projects/import-html
```

#### Request Examples

**GitBook Import**
```json
{
  "url": "https://example.gitbook.io/docs"
}
```

**HTML Import**
```json
{
  "content": "<html>...</html>",
  "baseUrl": "https://example.com"
}
```

**Confluence Import**
```json
{
  "xmlData": "<?xml version=\"1.0\"...>"
}
```

### Usage

```typescript
import { importContent } from '~/server/utils/import-unified';

const result = await importContent({
  type: 'auto', // or 'gitbook', 'markdown', 'html', 'csv'
  url: 'https://example.gitbook.io/docs',
  ownerId: userId,
  projectName: 'My Imported Project',
});
```

## Export Pipeline

Supports 5+ output formats:

### Supported Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| PDF | Print-ready PDF documents | Documentation publishing |
| Nuxt Static | Self-contained Nuxt site | Web hosting |
| VitePress | VitePress-compatible site | Developer docs |
| Plain HTML | Simple static pages | Any static host |
| GitBook | GitBook-compatible export | Platform migration |

### API Endpoints

#### Export to PDF

```typescript
POST /api/projects/[slug]/export-pdf
```

**Request**
```json
{
  "theme": "default",
  "includeToc": true,
  "pageSize": "A4",
  "margin": "1cm"
}
```

**Response**
```json
{
  "success": true,
  "fileName": "project-2024-01-01.pdf",
  "filePath": "/exports/pdf/project-2024-01-01.pdf",
  "fileSize": 245678
}
```

### Usage

```typescript
import { exportToPdf } from '~/server/utils/pdf-export';

const result = await exportToPdf(project, sections, {
  theme: 'professional',
  includeToc: true,
  pageSize: 'A4',
});
```

## Preview System

### Features

- **Real-time preview** of content changes
- **Theme switching** without reloading
- **Live updates** via WebSocket or polling

### API Endpoints

```typescript
GET /api/previews/[slug]
POST /api/previews/[slug]/refresh
```

## Sync System

### Features

- **Conflict detection** for concurrent edits
- **Version history** for rollback
- **Collaborative editing** support

### API Endpoints

```typescript
POST /api/sync/resolve
GET /api/sync/history/[contentId]
```

## Integration Testing

Run the integration test suite:

```bash
npm test -- tests/pipeline-integration.test.ts
```

Test coverage:

- Import/export format combinations
- API endpoint availability
- Preview system functionality
- Sync system conflict handling

## Error Handling

All pipeline endpoints handle errors gracefully:

```typescript
{
  "success": false,
  "error": "Import failed",
  "details": "Specific error message",
  "warnings": ["Optional warning 1", "Optional warning 2"]
}
```

## Performance Considerations

- Large imports use streaming to avoid memory issues
- PDF exports run asynchronously
- Preview updates debounce to reduce load
- Sync operations are non-blocking

## Future Enhancements

- Additional import formats (Notion, Word, Google Docs)
- Additional export formats (ePub, MOBI, JSON API)
- Batch import/export for multiple projects
- Import/export progress tracking
- Custom theme creation for exports
