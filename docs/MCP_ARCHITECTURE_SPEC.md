# MCP Implementation Architecture Spec

## Current State

The MCP (Model Context Protocol) server at `/server/routes/mcp.ts` provides read-only access to KnowledgeBook documentation via Streamable HTTP.

### Existing Tools

| Tool            | Description                                | Access Level |
| --------------- | ------------------------------------------ | ------------ |
| `list_projects` | Lists all documentation projects           | Public       |
| `get_project`   | Returns project structure and page slugs   | Public       |
| `get_page`      | Returns full markdown content of a page    | Public       |
| `search`        | Full-text search across titles and content | Public       |

### Security Characteristics

- **Authentication**: None (public endpoint)
- **Authorization**: None (all content is public)
- **Rate Limiting**: None
- **CORS**: Restricted to allowed origins via `ALLOWED_ORIGINS` env variable

## Architecture Spec for Missing Features

### 1. Authentication & Authorization Layer

#### Design Decisions

- Use existing session infrastructure (`server/utils/auth.ts`)
- MCP endpoints should respect the same access rules as the web UI
- Support two modes:
  - **Public read**: Current behavior (no auth required)
  - **Authenticated write**: Requires valid session with project permissions

#### Implementation Plan

```
/server/routes/mcp.ts (revised)
├── Authentication middleware
│   ├── Check for session cookie / header
│   ├── Load user from session store
│   └── Attach user to event context if authenticated
│
├── Authorization checks per tool
│   ├── Read tools: Public or authenticated
│   ├── Write tools: Authenticated + permission check
│   └── Admin tools: Project owner only
│
└── Error handling
    ├── 401 Unauthorized (no session)
    ├── 403 Forbidden (insufficient permissions)
    └── 404 Not Found (resource doesn't exist)
```

#### Permission Matrix

| Tool             | Auth Required | Permission Required |
| ---------------- | ------------- | ------------------- |
| `list_projects`  | No            | N/A (public)        |
| `get_project`    | No            | N/A (public)        |
| `get_page`       | No            | N/A (public)        |
| `search`         | No            | N/A (public)        |
| `create_project` | Yes           | Owner or member     |
| `create_page`    | Yes           | Owner or member     |
| `update_page`    | Yes           | Owner or member     |
| `delete_page`    | Yes           | Owner only          |
| `create_section` | Yes           | Owner or member     |
| `update_section` | Yes           | Owner or member     |
| `delete_section` | Yes           | Owner only          |

### 2. Write/Edit Tools Specification

#### Tool: `create_project`

**Description**: Create a new documentation project

**Input Schema**:

```typescript
{
  name: string (required, min 3 chars)
  slug: string (optional, auto-generated if omitted)
  description: string (optional, default: "")
  accent_color: string (optional, default: "#346ddb")
}
```

**Permissions**: Authenticated user (any role)

**Returns**: Project structure with new ID and slug

---

#### Tool: `create_page`

**Description**: Create a new page in an existing project

**Input Schema**:

```typescript
{
  project: string (required, project slug)
  title: string (required, min 1 char)
  slug: string (optional, auto-generated if omitted)
  content: string (optional, default: "")
  section_id?: number (optional, null for root page)
}
```

**Permissions**: Authenticated user (owner or member)

**Returns**: Page metadata (id, slug, title, position)

---

#### Tool: `update_page`

**Description**: Update an existing page's title and/or content

**Input Schema**:

```typescript
{
  project: string (required, project slug)
  page: string (required, page slug)
  title?: string (optional)
  content?: string (optional)
}
```

**Permissions**: Authenticated user (owner or member)

**Returns**: Updated page metadata with `updated_at` timestamp

---

#### Tool: `delete_page`

**Description**: Delete a page from the project

**Input Schema**:

```typescript
{
  project: string (required, project slug)
  page: string (required, page slug)
}
```

**Permissions**: Project owner only

**Returns**: `{"success": true}` or error message

---

#### Tool: `create_section`

**Description**: Create a new section within a project

**Input Schema**:

```typescript
{
  project: string (required, project slug)
  title: string (required, min 1 char)
  parent_section_id?: number (optional, null for root section)
  position?: number (optional, default: last position)
}
```

**Permissions**: Authenticated user (owner or member)

**Returns**: Section metadata (id, title, position)

---

#### Tool: `update_section`

**Description**: Update a section's title or position

**Input Schema**:

```typescript
{
  section_id: number (required)
  title?: string (optional)
  position?: number (optional)
}
```

**Permissions**: Project owner only

**Returns**: Updated section metadata

---

#### Tool: `delete_section`

**Description**: Delete a section and all contained pages/sections

**Input Schema**:

```typescript
{
  section_id: number(required);
}
```

**Permissions**: Project owner only

**Returns**: `{"success": true, deleted_count: {sections: N, pages: N}}`

---

### 3. Data Access Layer Enhancements

#### Required Database Operations

| Operation      | SQL Pattern                                           |
| -------------- | ----------------------------------------------------- |
| Insert project | `INSERT INTO projects (...) VALUES (?) RETURNING *`   |
| Insert section | `INSERT INTO sections (...) VALUES (?) RETURNING *`   |
| Insert page    | `INSERT INTO pages (...) VALUES (?) RETURNING *`      |
| Update section | `UPDATE sections SET ... WHERE id = ?`                |
| Update page    | `UPDATE pages SET ... WHERE id = ?`                   |
| Delete page    | `DELETE FROM pages WHERE project_id = ? AND slug = ?` |
| Delete section | `DELETE FROM sections WHERE id = ?`                   |
| Move section   | `UPDATE sections SET position = ? WHERE id = ?`       |
| Reorder pages  | `UPDATE pages SET position = ? WHERE id = ?`          |

#### Transaction Requirements

- All write operations should be wrapped in transactions
- Section/page deletions should use cascading deletes
- Reordering operations should use atomic position updates

### 4. Input Validation Schema

```typescript
const InputSchemas = {
  create_project: z.object({
    name: z.string().min(3, 'Project name must be at least 3 characters'),
    slug: z.string().optional(),
    description: z.string().optional().default(''),
    accent_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color')
      .optional()
      .default('#346ddb'),
  }),

  create_page: z.object({
    project: z.string().min(1, 'Project slug required'),
    title: z.string().min(1, 'Page title required'),
    slug: z.string().optional(),
    content: z.string().optional().default(''),
    section_id: z.number().optional(),
  }),

  update_page: z.object({
    project: z.string().min(1, 'Project slug required'),
    page: z.string().min(1, 'Page slug required'),
    title: z.string().optional(),
    content: z.string().optional(),
  }),

  delete_page: z.object({
    project: z.string().min(1, 'Project slug required'),
    page: z.string().min(1, 'Page slug required'),
  }),
};
```

### 5. Error Handling

| Error Type   | HTTP Status | MCP Response                                |
| ------------ | ----------- | ------------------------------------------- |
| Unauthorized | 401         | `{"error": "Authentication required"}`      |
| Forbidden    | 403         | `{"error": "Insufficient permissions"}`     |
| Not Found    | 404         | `{"error": "Project/page not found"}`       |
| Validation   | 400         | `{"error": "Invalid input: field message"}` |
| Conflict     | 409         | `{"error": "Slug already exists"}`          |
| Internal     | 500         | `{"error": "Server error"}`                 |

### 6. Rate Limiting Strategy

| Endpoint      | Limit       | Window     |
| ------------- | ----------- | ---------- |
| Read tools    | 100 req/min | IP-based   |
| Write tools   | 20 req/min  | User-based |
| Authenticated | 500 req/min | User-based |

### 7. Testing Strategy

#### Unit Tests

- Input validation for each tool
- Permission checks (user, admin, anonymous)
- Database CRUD operations

#### Integration Tests

- Full MCP request/response cycle
- Authentication flow
- Permission enforcement

#### Security Tests

- SQL injection prevention
- XSS prevention in content
- CSRF token validation (if sessions used)

---

## Next Steps

1. **Implement authentication middleware** - Check existing session
2. **Add write tool implementations** - CRUD operations for projects/pages/sections
3. **Implement authorization checks** - Permission validation per tool
4. **Add rate limiting** - IP and user-based limits
5. **Write integration tests** - End-to-end MCP workflow tests
6. **Update documentation** - Add security model section to README
