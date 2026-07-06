// MCP (Model Context Protocol) endpoint so AI agents can read the documentation.
//
// Serves a stateless Streamable HTTP MCP server at /mcp exposing read-only
// tools over the same public content as the docs pages: list projects, get a
// project's structure, read a page as markdown, and search. Connect with any
// MCP client, e.g.:  claude mcp add --transport http knowledgebook https://<host>/mcp
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

const MAX_SEARCH_RESULTS = 20
const SNIPPET_CONTEXT = 160

interface PageRow { slug: string, title: string, content: string, updated_at: string }

function text (value: string) {
  return { content: [{ type: 'text' as const, text: value }] }
}

function errorText (value: string) {
  return { content: [{ type: 'text' as const, text: value }], isError: true }
}

function projectStructure (project: ProjectRow): string {
  const db = useDb()
  const sections = db.prepare('SELECT id, title FROM sections WHERE project_id = ? ORDER BY position').all(project.id) as { id: number, title: string }[]
  const pagesBySection = db.prepare('SELECT section_id, slug, title FROM pages WHERE project_id = ? ORDER BY position').all(project.id) as { section_id: number | null, slug: string, title: string }[]

  const lines = [`# ${project.name} (project: ${project.slug})`]
  if (project.description) lines.push(project.description)
  lines.push('', 'Pages (use the `page` slug with the get_page tool):')

  const rootPages = pagesBySection.filter(p => p.section_id === null)
  for (const page of rootPages) lines.push(`- ${page.title} (page: ${page.slug})`)
  for (const section of sections) {
    lines.push('', `## ${section.title}`)
    for (const page of pagesBySection.filter(p => p.section_id === section.id)) {
      lines.push(`- ${page.title} (page: ${page.slug})`)
    }
  }
  return lines.join('\n')
}

function buildMcpServer (): McpServer {
  const server = new McpServer(
    { name: 'knowledgebook', version: '1.0.0' },
    {
      instructions: 'Read-only access to the documentation hosted on this KnowledgeBook instance. '
        + 'Typical flow: list_projects to discover documentation, get_project to see its pages, '
        + 'then get_page to read content. Use search to find pages by keyword across all projects.'
    }
  )
  const db = useDb()

  server.registerTool('list_projects', {
    title: 'List documentation projects',
    description: 'Lists every documentation project on this KnowledgeBook instance with its slug, name and description.',
    inputSchema: {}
  }, async () => {
    const projects = db.prepare(`
      SELECT p.slug, p.name, p.description, p.updated_at, COUNT(pg.id) AS page_count
      FROM projects p LEFT JOIN pages pg ON pg.project_id = p.id
      GROUP BY p.id ORDER BY p.name
    `).all() as (ProjectRow & { page_count: number })[]
    if (!projects.length) return text('No documentation projects exist yet.')
    return text(projects
      .map(p => `- ${p.name} (project: ${p.slug}) — ${p.page_count} pages${p.description ? ` — ${p.description}` : ''}`)
      .join('\n'))
  })

  server.registerTool('get_project', {
    title: 'Get project structure',
    description: 'Returns the section and page tree of a documentation project. Use the returned page slugs with get_page.',
    inputSchema: { project: z.string().describe('Project slug, as returned by list_projects') }
  }, async ({ project }) => {
    const row = getProjectBySlug(project.trim())
    if (!row) return errorText(`No project with slug "${project}". Call list_projects to see available projects.`)
    return text(projectStructure(row))
  })

  server.registerTool('get_page', {
    title: 'Read a documentation page',
    description: 'Returns the full markdown content of one documentation page.',
    inputSchema: {
      project: z.string().describe('Project slug'),
      page: z.string().describe('Page slug, as returned by get_project or search')
    }
  }, async ({ project, page }) => {
    const row = getProjectBySlug(project.trim())
    if (!row) return errorText(`No project with slug "${project}". Call list_projects to see available projects.`)
    const pageRow = db.prepare('SELECT slug, title, content, updated_at FROM pages WHERE project_id = ? AND slug = ?')
      .get(row.id, page.trim()) as PageRow | undefined
    if (!pageRow) return errorText(`No page "${page}" in project "${project}". Call get_project to see its pages.`)
    return text(`Title: ${pageRow.title}\nProject: ${row.slug}\nPage: ${pageRow.slug}\nLast updated: ${pageRow.updated_at}\n\n${pageRow.content}`)
  })

  server.registerTool('search', {
    title: 'Search the documentation',
    description: 'Full-text search across page titles and content. Returns matching pages with a snippet; read the full page with get_page.',
    inputSchema: {
      query: z.string().describe('Text to search for'),
      project: z.string().optional().describe('Optional project slug to limit the search to one project')
    }
  }, async ({ query, project }) => {
    const needle = query.trim()
    if (!needle) return errorText('Provide a non-empty search query.')
    const pattern = `%${needle.replace(/[\\%_]/g, c => `\\${c}`)}%`
    const projectFilter = project?.trim()
    const rows = db.prepare(`
      SELECT p.slug AS project, pg.slug AS page, pg.title, pg.content
      FROM pages pg JOIN projects p ON p.id = pg.project_id
      WHERE ${projectFilter ? 'p.slug = ? AND' : ''}
        (pg.title LIKE ? ESCAPE '\\' OR pg.content LIKE ? ESCAPE '\\')
      ORDER BY p.slug, pg.slug LIMIT ${MAX_SEARCH_RESULTS + 1}
    `).all(...(projectFilter ? [projectFilter] : []), pattern, pattern) as { project: string, page: string, title: string, content: string }[]

    if (!rows.length) return text(`No pages match "${needle}"${project ? ` in project "${project}"` : ''}.`)
    const results = rows.slice(0, MAX_SEARCH_RESULTS).map((row) => {
      const haystack = row.content.toLowerCase()
      const at = haystack.indexOf(needle.toLowerCase())
      const from = Math.max(0, at - SNIPPET_CONTEXT / 2)
      const snippet = at === -1
        ? row.content.slice(0, SNIPPET_CONTEXT)
        : row.content.slice(from, at + needle.length + SNIPPET_CONTEXT / 2)
      return `- ${row.title} (project: ${row.project}, page: ${row.page})\n  …${snippet.replace(/\s+/g, ' ').trim()}…`
    })
    if (rows.length > MAX_SEARCH_RESULTS) results.push(`(more results exist — refine the query${project ? '' : ' or limit it to one project'})`)
    return text(results.join('\n'))
  })

  return server
}

export default defineEventHandler(async (event) => {
  // Permissive CORS so browser-based MCP clients can connect too.
  setResponseHeaders(event, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version',
    'access-control-expose-headers': 'mcp-session-id'
  })
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return null
  }
  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    return {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'This MCP server is stateless: send JSON-RPC requests via POST.' },
      id: null
    }
  }

  // The server runs statelessly: a fresh server + transport pair per request,
  // no session ids, plain JSON responses (no SSE stream to keep open).
  const server = buildMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  await server.connect(transport)

  // Rebuild the request with the dual accept header the transport insists on —
  // several MCP clients send a plain `accept: application/json`.
  const original = toWebRequest(event)
  const headers = new Headers(original.headers)
  headers.set('accept', 'application/json, text/event-stream')
  const request = new Request(original.url, {
    method: original.method,
    headers,
    body: original.body,
    // Node's fetch requires this when the body is a stream.
    duplex: 'half'
  } as RequestInit)

  return await transport.handleRequest(request)
})
