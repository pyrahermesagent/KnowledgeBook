# Multi-Modal Content Pipeline

## Overview

The Multi-Modal Content Pipeline is a unified system for handling content import, export, preview, and synchronization across multiple formats. It provides a single API interface for all content operations while supporting various input and output formats.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Unified API Endpoints                     │
│  /api/projects/importUnified.post.ts                        │
│  /api/exports/exportUnified.post.ts                         │
│  /api/previews/previewUnified.post.ts                       │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Import Pipeline │  │ Export Pipeline  │  │ Preview Pipeline │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                              │
                              ▼
                      ┌──────────────────┐
                      │ Content Sync     │
                      │ Pipeline         │
                      └──────────────────┘
```

## Supported Formats

### Import Formats (7+)
- **GitBook** - Published GitBook sites via llms.txt/sitemap.xml
- **Markdown** - .md, .markdown, .mkd files
- **HTML** - .html, .htm files and CMS exports
- **CSV** - Structured content via CSV
- **Confluence** - Atlassian Confluence XML exports
- **Notion** - Notion JSON exports
- **PDF** - PDF document imports
- **EPUB** - EPUB e-book imports

### Export Formats (5+)
- **Web** - Static HTML site
- **PDF** - Print-ready PDF documents
- **EPUB** - E-book format for e-readers
- **ZIP** - Archived static site
- **API Response** - JSON response for programmatic use

## Usage

### Import API

```typescript
// Unified import endpoint
POST /api/projects/importUnified

// Request body
{
  "content": "Markdown content or HTML",
  "url": "https://example.com/gitbook",
  "format": "auto", // or 'markdown', 'html', 'csv', 'confluence', 'notion', 'pdf', 'epub'
  "projectName": "My Project",
  "projectSlug": "my-project"
}

// Response
{
  "success": true,
  "slug": "my-project",
  "name": "My Project",
  "sectionCount": 5,
  "pageCount": 20,
  "failedCount": 0,
  "importFormat": "markdown"
}
```

### Export API

```typescript
// Unified export endpoint
POST /api/exports/exportUnified

// Request body
{
  "projectSlug": "my-project",
  "format": "pdf", // or 'web', 'epub', 'zip', 'api'
  "theme": "default", // theme name for styling
  "pageSize": "A4", // for PDF export
  "includeToc": true
}

// Response
{
  "success": true,
  "exportId": "exp_1234567890_abc123",
  "format": "pdf",
  "outputUrl": "/exports/pdf/my-project-2024-01-01.pdf",
  "filesGenerated": 1,
  "pagesExported": 20,
  "status": "completed"
}
```

### Preview API

```typescript
// Unified preview endpoint
POST /api/previews/previewUnified

// Request body
{
  "projectSlug": "my-project",
  "format": "web", // or 'pdf', 'epub'
  "theme": "default"
}

// Response
{
  "success": true,
  "format": "web",
  "previewContent": "<!DOCTYPE html>...",
  "themes": [...],
  "currentTheme": {...},
  "status": "completed"
}
```

### Content Sync API

```typescript
// Unified sync endpoint
POST /api/sync/content

// Request body
{
  "projectSlug": "my-project",
  "remoteUrl": "https://gitbook.example.com",
  "remoteToken": "xxx",
  "direction": "bidirectional", // 'upload', 'download', 'bidirectional'
  "conflictStrategy": "auto-merge" // 'ours', 'theirs', 'manual'
}

// Response
{
  "success": true,
  "syncedPages": 20,
  "syncedSections": 5,
  "conflicts": [],
  "syncedAt": "2024-01-01T00:00:00.000Z"
}
```

## Implementation Details

### Import Pipeline (`server/utils/import-pipeline.ts`)

The import pipeline handles all import operations with the following features:
- **Auto-detection**: Automatically detects format based on content, URL, or filename
- **Format validation**: Validates supported formats before processing
- **Error handling**: Graceful error reporting with detailed messages

Key functions:
- `detectFormat(content, url, filename)` - Determines format
- `importContent(options)` - Main import function
- `validateImportRequest(options)` - Validates import request

### Export Pipeline (`server/utils/export-pipeline.ts`)

The export pipeline handles all export operations with the following features:
- **Status tracking**: Tracks export progress and status
- **Format-specific handlers**: Specialized handlers for each format
- **History management**: Maintains export history

Key functions:
- `createExportStatus(projectSlug, format)` - Creates export record
- `exportContent(options)` - Main export function
- `getExportHistory(limit)` - Gets export history
- `getAvailableExportFormats()` - Lists available formats

### Preview Pipeline (`server/utils/preview-pipeline.ts`)

The preview pipeline provides real-time content preview with the following features:
- **Theme switching**: Switch between multiple themes
- **Format support**: Preview in web, PDF, or EPUB format
- **Live update**: Supports live preview with change detection

Key functions:
- `previewContent(options)` - Main preview function
- `getAvailableThemes()` - Lists available themes
- `getTheme(name)` - Gets specific theme
- `refreshLivePreview(options)` - Refreshes live preview

### Content Sync Pipeline (`server/utils/content-sync.ts`)

The content sync pipeline handles bidirectional sync with the following features:
- **Multiple sync targets**: GitBook, Confluence, Notion, generic CMS
- **Conflict resolution**: Multiple strategies for resolving conflicts
- **History tracking**: Sync operation history

Key functions:
- `syncContent(options)` - Main sync function
- `resolveConflict(conflict, strategy)` - Resolves individual conflicts
- `detectConflicts(localPages, remotePages)` - Detects sync conflicts
- `getConflictStrategies()` - Lists available strategies

## Theme System

The preview system supports multiple themes:

| Theme | Name | Description |
|-------|------|-------------|
| default | Default | Standard light theme |
| light | Light | Clean light theme |
| dark | Dark | Dark mode theme |
| minimal | Minimal | Minimal content focus |
| academic | Academic | Scholarly formatting |
| professional | Professional | Corporate style |
| read | Read | Reading-optimized |
| ink | Ink | Print-like appearance |

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information"
}
```

Status codes:
- `400` - Bad request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (no access to resource)
- `404` - Not found (resource doesn't exist)
- `500` - Internal server error

## API Reference

### Import API

**Endpoint**: `POST /api/projects/importUnified`

**Request Body**:
- `content` (string, optional): Content to import
- `url` (string, optional): URL to import from
- `format` (string, optional): Format hint ('auto', 'markdown', 'html', etc.)
- `projectName` (string, optional): Name for new project
- `projectSlug` (string, optional): Slug for new project

**Response**:
- `success` (boolean)
- `slug` (string): Project slug
- `name` (string): Project name
- `sectionCount` (number)
- `pageCount` (number)
- `failedCount` (number)

### Export API

**Endpoint**: `POST /api/exports/exportUnified`

**Request Body**:
- `projectSlug` (string): Project to export
- `format` (string): Export format
- `theme` (string, optional): Theme name
- `pageSize` (string, optional): Page size for PDF
- `margin` (string, optional): Margin for PDF
- `includeToc` (boolean, optional): Include table of contents

**Response**:
- `success` (boolean)
- `exportId` (string): Export job ID
- `format` (string)
- `outputUrl` (string, optional): Download URL
- `filesGenerated` (number)
- `pagesExported` (number)
- `status` (string): 'pending', 'processing', 'completed', 'failed'

### Preview API

**Endpoint**: `POST /api/previews/previewUnified`

**Request Body**:
- `projectSlug` (string): Project to preview
- `format` (string, optional): 'web', 'pdf', 'epub'
- `theme` (string, optional): Theme name

**Response**:
- `success` (boolean)
- `format` (string)
- `previewContent` (string, optional): HTML content
- `themes` (array): Available themes
- `currentTheme` (object): Current theme info
- `status` (string)

### Sync API

**Endpoint**: `POST /api/sync/content`

**Request Body**:
- `projectSlug` (string): Project to sync
- `remoteUrl` (string): Remote CMS URL
- `remoteToken` (string): Authentication token
- `direction` (string): 'upload', 'download', 'bidirectional'
- `conflictStrategy` (string): 'ours', 'theirs', 'manual', 'auto-merge'

**Response**:
- `success` (boolean)
- `syncedPages` (number)
- `syncedSections` (number)
- `conflicts` (array): Any conflicts found
- `syncedAt` (string)

## Testing

To test the pipeline endpoints:

```bash
# Test import
curl -X POST http://localhost:3000/api/projects/importUnified \
  -H "Content-Type: application/json" \
  -d '{"content": "# Test", "format": "markdown", "projectName": "Test"}'

# Test export
curl -X POST http://localhost:3000/api/exports/exportUnified \
  -H "Content-Type: application/json" \
  -d '{"projectSlug": "test", "format": "pdf"}'

# Test preview
curl -X POST http://localhost:3000/api/previews/previewUnified \
  -H "Content-Type: application/json" \
  -d '{"projectSlug": "test", "format": "web"}'
```

## Future Enhancements

- [ ] Add more import formats (Word, Google Docs, etc.)
- [ ] Add more export formats (ePub 3, MOBI, etc.)
- [ ] Add real-time WebSocket sync
- [ ] Add batch import/export
- [ ] Add preview history
- [ ] Add content versioning
