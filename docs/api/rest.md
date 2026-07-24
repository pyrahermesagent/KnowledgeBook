# REST API Reference

KnowledgeBook exposes a REST API for managing documentation projects, sections, pages, and content.

## Base URL

The API is available at `{baseURL}/api/` endpoints. All authenticated endpoints require a valid session cookie.

## Authentication

Most endpoints require authentication via Google OAuth. Endpoints that don't specify authentication are publicly readable.

Authentication header: `Cookie: session={session_token}`

## Projects API

### List Projects

Lists all projects the authenticated user owns or is a member of.

**Endpoint:** `GET /api/projects`

**Authentication:** Required

**Response:**
```json
{
  "projects": [
    {
      "id": 1,
      "slug": "my-project",
      "name": "My Project",
      "description": "Project description",
      "accent_color": "#34c759",
      "icon_url": "https://...",
      "font_family": "Inter",
      "bg_color": "#ffffff",
      "bg_subtle": "#f5f5f5",
      "text_color": "#000000",
      "text-muted": "#666666",
      "border_color": "#e5e5e5",
      "radius": 8,
      "updated_at": "2024-01-15T10:30:00Z",
      "role": "admin"
    }
  ]
}
```

### Get Project

Retrieves a specific project by slug.

**Endpoint:** `GET /api/projects/{slug}`

**Authentication:** Required (for owned projects)

**Response:**
```json
{
  "id": 1,
  "slug": "my-project",
  "name": "My Project",
  "description": "Project description",
  "accent_color": "#34c759",
  "icon_url": "https://...",
  "font_family": "Inter",
  "bg_color": "#ffffff",
  "bg_subtle": "#f5f5f5",
  "text_color": "#000000",
  "text-muted": "#666666",
  "border_color": "#e5e5e5",
  "radius": 8,
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Create Project

Creates a new documentation project.

**Endpoint:** `POST /api/projects`

**Authentication:** Required

**Request Body:**
```json
{
  "name": "My New Project",
  "description": "Project description",
  "accent_color": "#34c759",
  "icon_url": "https://example.com/icon.png",
  "font_family": "Inter"
}
```

**Response:** `201 Created`

### Update Project

Updates project settings.

**Endpoint:** `PATCH /api/projects/{slug}`

**Authentication:** Required (project admin only)

**Request Body:** Any of the project fields (partial update)

### Delete Project

Deletes a project (admin only).

**Endpoint:** `DELETE /api/projects/{slug}`

**Authentication:** Required (project admin only)

**Response:** `204 No Content`

### Import from GitBook

Imports an entire GitBook site as a new project.

**Endpoint:** `POST /api/projects/import-gitbook`

**Authentication:** Required

**Request Body:**
```json
{
  "gitbook_url": "https://example.gitbook.com/site",
  "project_name": "Imported Project",
  "project_description": "Imported from GitBook"
}
```

**Response:** `201 Created`

## Sections API

### List Sections

Lists all sections in a project.

**Endpoint:** `GET /api/projects/{slug}/sections`

**Authentication:** Required (project member)

**Response:**
```json
{
  "sections": [
    {
      "id": 1,
      "project_id": 1,
      "title": "Getting Started",
      "position": 1,
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create Section

Creates a new section.

**Endpoint:** `POST /api/projects/{slug}/sections`

**Authentication:** Required (project member)

**Request Body:**
```json
{
  "title": "API Reference",
  "position": 2
}
```

**Response:** `201 Created`

### Update Section

Updates section title or position.

**Endpoint:** `PATCH /api/projects/{slug}/sections/{id}`

**Authentication:** Required (project member)

**Request Body:**
```json
{
  "title": "Updated Section Title",
  "position": 3
}
```

### Delete Section

Deletes a section and its pages.

**Endpoint:** `DELETE /api/projects/{slug}/sections/{id}`

**Authentication:** Required (project member)

**Response:** `204 No Content`

## Pages API

### List Pages

Lists all pages in a project.

**Endpoint:** `GET /api/projects/{slug}/pages`

**Authentication:** Required (project member)

**Response:**
```json
{
  "pages": [
    {
      "id": 1,
      "project_id": 1,
      "section_id": 1,
      "slug": "overview",
      "title": "Overview",
      "content": "# Overview\n\nThis is the overview page.",
      "position": 1,
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Get Page

Retrieves a specific page by slug.

**Endpoint:** `GET /api/projects/{slug}/view/{page}`

**Authentication:** Required (project member)

**Response:**
```json
{
  "id": 1,
  "project_id": 1,
  "section_id": 1,
  "slug": "overview",
  "title": "Overview",
  "content": "# Overview\n\nThis is the overview page.",
  "position": 1,
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### Create Page

Creates a new page.

**Endpoint:** `POST /api/projects/{slug}/pages`

**Authentication:** Required (project member)

**Request Body:**
```json
{
  "title": "API Reference",
  "slug": "api-reference",
  "content": "# API Reference\n\n...",
  "section_id": 1,
  "position": 1
}
```

**Response:** `201 Created`

### Update Page

Updates page content or metadata.

**Endpoint:** `PATCH /api/projects/{slug}/pages/{id}`

**Authentication:** Required (project member)

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "# Updated Content",
  "position": 2
}
```

### Delete Page

Deletes a page.

**Endpoint:** `DELETE /api/projects/{slug}/pages/{id}`

**Authentication:** Required (project member)

**Response:** `204 No Content`

## Members API

### List Members

Lists all members of a project.

**Endpoint:** `GET /api/projects/{slug}/members`

**Authentication:** Required (project member)

**Response:**
```json
{
  "members": [
    {
      "id": 1,
      "project_id": 1,
      "email": "user@example.com",
      "role": "member",
      "joined_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Add Member

Adds a member to a project.

**Endpoint:** `POST /api/projects/{slug}/members`

**Authentication:** Required (project admin only)

**Request Body:**
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Response:** `201 Created`

### Remove Member

Removes a member from a project.

**Endpoint:** `DELETE /api/projects/{slug}/members/{id}`

**Authentication:** Required (project admin only)

**Response:** `204 No Content`

## Uploads API

### Upload File

Uploads a file (images, documents).

**Endpoint:** `POST /api/projects/{slug}/upload`

**Authentication:** Required (project member)

**Request Body:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "url": "https://storage.example.com/path/to/file.png",
  "filename": "file.png",
  "size": 12345,
  "content_type": "image/png"
}
```

## Theme API

### Get Project Theme

Retrieves the custom theme settings for a project.

**Endpoint:** `GET /api/projects/{slug}/theme`

**Authentication:** Required (project member)

**Response:**
```json
{
  "accent_color": "#34c759",
  "font_family": "Inter",
  "bg_color": "#ffffff",
  "bg_subtle": "#f5f5f5",
  "text_color": "#000000",
  "text-muted": "#666666",
  "border_color": "#e5e5e5",
  "radius": 8
}
```

### Update Project Theme

Updates theme settings.

**Endpoint:** `PATCH /api/projects/{slug}/theme`

**Authentication:** Required (project admin only)

**Request Body:**
```json
{
  "accent_color": "#34c759",
  "font_family": "Inter",
  "bg_color": "#ffffff",
  "bg_subtle": "#f5f5f5",
  "text_color": "#000000",
  "text-muted": "#666666",
  "border_color": "#e5e5e5",
  "radius": 8
}
```

## Web3 Endpoints

### Login with Wallet

Authenticates a user via cryptocurrency wallet signature.

**Endpoint:** `POST /api/auth/wallet/login`

**Request Body:**
```json
{
  "address": "0x...",
  "message": "Login to KnowledgeBook",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "session_token",
  "user": {
    "id": 1,
    "wallet_address": "0x...",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## Error Responses

All endpoints return standard HTTP status codes:

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success with no content
- `400 Bad Request` - Invalid request body or parameters
- `401 Unauthorized` - Authentication required or invalid
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

Error response format:
```json
{
  "error": "Error message",
  "statusCode": 400
}
```

## Rate Limiting

API calls are rate-limited to 100 requests per minute per authenticated user.

## Webhooks (Planned)

Future versions will support webhooks for real-time updates.
