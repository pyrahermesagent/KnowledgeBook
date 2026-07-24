# MCP Server API

KnowledgeBook includes a Model Context Protocol (MCP) server for AI agents to read documentation.

## MCP Server Endpoint

The MCP server is available at: `{baseURL}/mcp`

**Example:** `https://knowledgebook.plutolabs.app/mcp`

## Connection

### Claude Code
```sh
claude mcp add --transport http knowledgebook https://knowledgebook.plutolabs.app/mcp
```

### Manual Configuration
```json
{
  "mcpServers": {
    "knowledgebook": {
      "type": "http",
      "url": "https://knowledgebook.plutolabs.app/mcp"
    }
  }
}
```

## Supported Tools

### list_projects

Lists all documentation projects on the KnowledgeBook instance.

**Input:** None

**Output:** List of projects with slug, name, description, and page count.

**Example:**
```
- My Project (project: my-project) — 5 pages
- API Docs (project: api-docs) — 12 pages
```

### get_project

Gets the section and page tree of a documentation project.

**Input:**
```json
{
  "project": "project-slug"
}
```

**Output:** Project structure with sections and page slugs.

**Example:**
```
# My Project (project: my-project)
## Getting Started
- Overview (page: overview)
- Installation (page: installation)
## API Reference
- Endpoints (page: endpoints)
- Authentication (page: auth)
```

### get_page

Reads the full markdown content of a documentation page.

**Input:**
```json
{
  "project": "project-slug",
  "page": "page-slug"
}
```

**Output:** Complete page content with metadata.

**Example:**
```
Title: API Reference
Project: my-project
Page: api-reference
Last updated: 2024-01-15T10:30:00Z

# API Reference

This document describes...
```

### search

Searches across page titles and content.

**Input:**
```json
{
  "query": "search query",
  "project": "optional-project-slug"
}
```

**Output:** Matching pages with snippets.

**Example:**
```
- API Endpoints (project: my-project, page: endpoints)
  …API endpoints for managing documentation projects…
- Authentication (project: api-docs, page: auth)
  …Authentication with API keys and OAuth…
```

## API Rate Limits

- Read operations: 60 requests per minute
- Search operations: 30 requests per minute

## Authentication

- **Read operations:** Public (no authentication required)
- **Write operations:** Not available (MCP server is read-only)

## Error Responses

MCP errors follow the JSON-RPC 2.0 format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Error message"
  },
  "id": null
}
```

## Usage Examples

### Python
```python
import requests
import json

def call_mcp_tool(url, tool_name, params=None):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": params or {}
        },
        "id": 1
    }
    response = requests.post(url, headers=headers, json=payload)
    return response.json()

# List projects
result = call_mcp_tool(
    "https://knowledgebook.plutolabs.app/mcp",
    "list_projects"
)
print(result)

# Search documentation
result = call_mcp_tool(
    "https://knowledgebook.plutolabs.app/mcp",
    "search",
    {"query": "authentication", "project": "docs"}
)
print(result)
```

### JavaScript
```javascript
async function callMcpTool(url, toolName, params = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream'
  };
  const payload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: params || {}
    },
    id: 1
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  
  return await response.json();
}

// List projects
const projects = await callMcpTool(
  'https://knowledgebook.plutolabs.app/mcp',
  'list_projects'
);
console.log(projects);

// Get project structure
const project = await callMcpTool(
  'https://knowledgebook.plutolabs.app/mcp',
  'get_project',
  { project: 'my-project' }
);
console.log(project);
```

## MCP Protocol Version

The server implements MCP protocol version compatible with:
- `@modelcontextprotocol/sdk` v1.29.0+
- Claude Code 2.3+

## Self-Hosted MCP

When self-hosting KnowledgeBook, the MCP server is available at:
- Development: `http://localhost:3000/mcp`
- Production: `{your-domain}/mcp`

No configuration required - the MCP server runs automatically.
