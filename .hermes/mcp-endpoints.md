# MCP Endpoints - KnowledgeBook AI Agent Integration

**Last Updated:** 2026-07-23  
**Version:** 1.1.0  
**Endpoint:** `https://<host>/mcp`

KnowledgeBook exposes a Model Context Protocol (MCP) server at `/mcp` that allows AI agents to read and write documentation content programmatically.

---

## Overview

The MCP server provides stateless HTTP access to KnowledgeBook documentation content via JSON-RPC. Agents can:

- **Read**: List projects, get project structure, read pages, search content
- **Write**: Create/update pages and sections (with authentication)
- **AI Integration**: Search with AI-powered summaries

---

## Connection

### MCP Client Setup (Anthropic CLI)
```bash
claude mcp add --transport http knowledgebook https://<host>/mcp
```

### MCP Client Setup (Generic)
```bash
# POST /mcp with JSON-RPC 2.0 payload
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": { "name": "list_projects" },
  "id": 1
}
```

---

## Available Tools

### Read-Only Tools

#### 1. `list_projects`
Lists all documentation projects.

**Input Schema:**
- None

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_projects"
  },
  "id": 1
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      { "type": "text", "text": "- My Project (project: my-project) — 15 pages — Documentation for my project" }
    ]
  }
}
```

---

#### 2. `get_project`
Returns the section and page tree of a project.

**Input Schema:**
- `project` (string, required): Project slug from `list_projects`

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_project",
    "arguments": { "project": "my-project" }
  },
  "id": 2
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      { "type": "text", "text": "# My Project (project: my-project)\n\nPages (use the `page` slug with the get_page tool):\n- Getting Started (page: getting-started)\n- API Reference (page: api-reference)\n\n## API Reference\n- Endpoints (page: endpoints)\n- Authentication (page: auth)" }
    ]
  }
}
```

---

#### 3. `get_page`
Returns the full markdown content of a page.

**Input Schema:**
- `project` (string, required): Project slug
- `page` (string, required): Page slug from `get_project`

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_page",
    "arguments": { "project": "my-project", "page": "getting-started" }
  },
  "id": 3
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "ID: 123\nTitle: Getting Started\nProject: my-project\nPage: getting-started\nLast updated: 2026-07-20T12:00:00+00:00\n\n# Getting Started\n\nThis guide covers..." }
    ]
  }
}
```

---

#### 4. `search`
Full-text search across page titles and content.

**Input Schema:**
- `query` (string, required): Text to search for
- `project` (string, optional): Limit search to one project

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": { "query": "authentication", "project": "my-project" }
  },
  "id": 4
}
```

---

### Write-Capable Tools (Authenticated)

#### Authentication Requirements
All write operations require authentication:
1. User must be logged in via Google OAuth or Web3 wallet
2. User must have write access to the project (owner or project member)

**HTTP Headers:**
- `Authorization: Bearer <token>` (OAuth)
- Or session cookie set by `nuxt-auth-utils`

---

#### 5. `create_page`
Creates a new documentation page.

**Input Schema:**
- `project` (string, required): Project slug
- `title` (string, required): Page title (min 1 char)
- `content` (string, optional): Initial markdown content
- `section` (string, optional): Section slug to place page under
- `isAiEdit` (boolean, optional): Mark as AI-generated (default: false)

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_page",
    "arguments": {
      "project": "my-project",
      "title": "New Feature Guide",
      "content": "# New Feature Guide\n\nThis covers the new feature...",
      "isAiEdit": true
    }
  },
  "id": 5
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "content": [
      { "type": "text", "text": "Page created successfully!\n\nID: 456\nSlug: new-feature-guide\nTitle: New Feature Guide\nProject: my-project\nCreated by: user@example.com (AI)" }
    ]
  }
}
```

---

#### 6. `update_page`
Updates an existing page with version tracking.

**Input Schema:**
- `project` (string, required): Project slug
- `page` (string, required): Page slug
- `content` (string, optional): New content
- `title` (string, optional): New title
- `isAiEdit` (boolean, optional): Mark as AI-generated (default: false)
- `versionComment` (string, optional): Change description

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "update_page",
    "arguments": {
      "project": "my-project",
      "page": "getting-started",
      "content": "# Getting Started\n\nUpdated content...",
      "versionComment": "Updated installation instructions"
    }
  },
  "id": 6
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      { "type": "text", "text": "Page updated successfully!\n\nID: 123\nTitle: Getting Started\nLast updated by: user@example.com (Human)\nComment: Updated installation instructions" }
    ]
  }
}
```

---

#### 7. `create_section`
Creates a new section in a project.

**Input Schema:**
- `project` (string, required): Project slug
- `title` (string, required): Section title
- `parent` (string, optional): Parent section slug for nesting

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_section",
    "arguments": {
      "project": "my-project",
      "title": "API Reference",
      "parent": "Documentation"
    }
  },
  "id": 7
}
```

---

#### 8. `search_and_summarize`
Searches and generates AI summary of results.

**Input Schema:**
- `query` (string, required): Search query
- `project` (string, optional): Limit search to one project
- `maxResults` (number, optional): Results to include in summary (default: 5)
- `temperature` (number, optional): AI temperature (default: 0.7)

**Example Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_and_summarize",
    "arguments": {
      "query": "how to configure API keys",
      "project": "my-project",
      "maxResults": 3,
      "temperature": 0.5
    }
  },
  "id": 8
}
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "content": [
      { "type": "text", "text": "## Search Results Summary\n\n**Query:** \"how to configure API keys\"\n**Results Found:** 3\n\n---\n\n**AI Summary:**\nTo configure API keys, follow these steps..." }
    ]
  }
}
```

---

## Rate Limiting

MCP server implements token bucket rate limiting:
- **Maximum burst:** 10 requests
- **Refill rate:** 2 requests/second
- **Token bucket expiration:** 5 minutes of inactivity

---

## Error Handling

### Authentication Errors
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": 401,
    "message": "Authentication required for write operations. Please log in first."
  }
}
```

### Authorization Errors
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": 403,
    "message": "You do not have permission to update pages in this project."
  }
}
```

### Invalid Request
```json
{
  "jsonrpc": "2.0",
  "id": null,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

---

## Security Considerations

1. **Authentication Required**: All write operations require valid authentication
2. **CORS**: Restricted to configured origins via `ALLOWED_ORIGINS` environment variable
3. **SQL Injection**: All queries use parameterized statements
4. **XSS Prevention**: Vue.js auto-escaping for all user content
5. **Rate Limiting**: Prevents abuse via token bucket algorithm

---

## Configuration

### Environment Variables
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins
- `OPENAI_API_KEY`: For AI summary generation (optional)
- `ANTHROPIC_API_KEY`: Alternative AI provider (optional)
- `AI_MODEL`: Model to use (default: gpt-4o-mini)
- `AI_PROVIDER`: Provider to use (openai or anthropic)

---

## Supported Clients

The MCP server is compatible with any MCP SDK client:

### Anthropic Claude Desktop
```bash
claude mcp add --transport http knowledgebook https://<host>/mcp
```

### Python MCP Client
```python
from mcp import Client, Session
import httpx

async with Client(
    transport=httpx.HTTPTransport(),
    url="https://<host>/mcp"
) as client:
    result = await client.call_tool("list_projects")
    print(result)
```

### Node.js MCP Client
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'knowledgebook-client',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

await client.connect(
  new URL('https://<host>/mcp')
);
const result = await client.request({
  method: 'tools/call',
  params: { name: 'list_projects' }
});
console.log(result);
```

---

## Troubleshooting

### Connection Timeout
- Verify the MCP endpoint is accessible: `curl -X POST <host>/mcp`
- Check server logs for errors
- Ensure CORS headers are configured correctly

### Authentication Failures
- Verify session cookies are being sent
- Check OAuth tokens are valid and not expired
- Ensure user has write access to the project

### Rate Limiting
- Wait for token bucket to refill (5 minutes of inactivity resets)
- Reduce request frequency

---

## API Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-07-23 | Added `search_and_summarize`, `page_versions` table support |
| 1.0.0 | 2026-07-20 | Initial release with read/write tools |

---

**For questions or support, contact the KnowledgeBook team.**