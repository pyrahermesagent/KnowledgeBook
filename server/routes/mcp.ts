// MCP (Model Context Protocol) endpoint so AI agents can read/write the documentation.
//
// Serves a stateless Streamable HTTP MCP server at /mcp exposing tools over
// the same public content as the docs pages: list projects, get a project's
// structure, read a page as markdown, search, and AI-powered write operations.
// Connect with any MCP client, e.g.:  claude mcp add --transport http knowledgebook https://<host>/mcp
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { H3Event } from 'h3';

const MAX_SEARCH_RESULTS = 20;
const SNIPPET_CONTEXT = 160;

interface PageRow {
  id: number;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
  project_id: number;
  section_id: number | null;
  position: number;
}

interface SectionRow {
  id: number;
  project_id: number;
  title: string;
  position: number;
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function errorText(value: string) {
  return { content: [{ type: 'text' as const, text: value }], isError: true };
}

function projectStructure(project: ProjectRow): string {
  const db = useDb();
  const sections = db
    .prepare('SELECT id, title FROM sections WHERE project_id = ? ORDER BY position')
    .all(project.id) as SectionRow[];
  const pagesBySection = db
    .prepare('SELECT section_id, slug, title FROM pages WHERE project_id = ? ORDER BY position')
    .all(project.id) as { section_id: number | null; slug: string; title: string }[];

  const lines = [`# ${project.name} (project: ${project.slug})`];
  if (project.description) lines.push(project.description);
  lines.push('', 'Pages (use the `page` slug with the get_page tool):');

  const rootPages = pagesBySection.filter((p) => p.section_id === null);
  for (const page of rootPages) lines.push(`- ${page.title} (page: ${page.slug})`);
  for (const section of sections) {
    lines.push('', `## ${section.title}`);
    for (const page of pagesBySection.filter((p) => p.section_id === section.id)) {
      lines.push(`- ${page.title} (page: ${page.slug})`);
    }
  }
  return lines.join('\n');
}

function getProjectBySlugSafe(slug: string): ProjectRow | undefined {
  return useDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug.trim()) as ProjectRow | undefined;
}

// ============================================================================
// WRITE TOOLS IMPLEMENTATION
// ============================================================================

/**
 * Authenticate the user for write operations.
 * Returns user info or throws 401/403 errors.
 */
async function authenticateWriteAccess(event: H3Event) {
  try {
    const session = await requireUserSession(event);
    return session.user as { id: number; email: string; name: string; avatar: string };
  } catch (error) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required for write operations. Please log in first.'
    });
  }
}

/**
 * Check if user has project write access
 */
function hasProjectWriteAccess(projectId: number, userId: number, email: string): boolean {
  const db = useDb();
  
  // Check if user is project owner
  const owner = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId);
  if (owner && owner.owner_id === userId) return true;
  
  // Check if user is project member
  const isMember = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND email = ?')
    .get(projectId, email);
  return !!isMember;
}

/**
 * Create a new page version entry
 */
function createPageVersion(
  db: Database.Database,
  pageId: number,
  content: string,
  title: string,
  userId: number,
  isAiEdit: boolean = false
): number {
  return db.prepare(`
    INSERT INTO page_versions (page_id, content, title, edited_by_user_id, is_ai_edit, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(pageId, content, title, userId).lastInsertRowid as number;
}

/**
 * Get page version history for audit trail
 */
function getPageVersionHistory(db: Database.Database, pageId: number, limit: number = 10): any[] {
  return db.prepare(`
    SELECT pv.id, pv.content, pv.title, pv.created_at, pv.is_ai_edit,
           u.name as editor_name, u.email as editor_email
    FROM page_versions pv
    LEFT JOIN users u ON pv.edited_by_user_id = u.id
    WHERE pv.page_id = ?
    ORDER BY pv.created_at DESC
    LIMIT ?
  `).all(pageId, limit);
}

// ============================================================================
// WRITE TOOLS: create_page
// ============================================================================

function registerCreatePageTool(server: McpServer) {
  server.registerTool(
    'create_page',
    {
      title: 'Create a new documentation page',
      description:
        'Creates a new documentation page in the specified project. ' +
        'Returns the created page with its ID and slug for future updates.',
      inputSchema: {
        project: z.string().describe('Project slug where page should be created'),
        title: z.string().min(1).describe('Page title'),
        content: z.string().optional().describe('Initial page content (markdown)'),
        section: z.string().optional().describe('Section slug to place page under (optional)'),
        isAiEdit: z.boolean().optional().default(false).describe('Marks this as an AI-generated edit for version tracking'),
      },
    },
    async ({ project, title, content = '', section, isAiEdit = false }, { _request }) => {
      const event = _request as unknown as H3Event;
      const user = await authenticateWriteAccess(event);
      
      const projectRow = getProjectBySlugSafe(project.trim());
      if (!projectRow) {
        return errorText(
          `No project with slug "${project}". Call list_projects to see available projects.`
        );
      }
      
      if (!hasProjectWriteAccess(projectRow.id, user.id, user.email)) {
        return errorText('You do not have permission to create pages in this project.');
      }
      
      const db = useDb();
      
      // Determine section ID if provided
      let sectionId: number | null = null;
      if (section) {
        const sectionRow = db
          .prepare('SELECT id FROM sections WHERE project_id = ? AND slug = ?')
          .get(projectRow.id, section.trim());
        if (!sectionRow) {
          return errorText(
            `No section with slug "${section}" in project "${project}". Call get_project to see available sections.`
          );
        }
        sectionId = sectionRow.id;
      }
      
      // Calculate position (last + 1)
      const maxPos = db
        .prepare('SELECT COALESCE(MAX(position), 0) + 1 as pos FROM pages WHERE project_id = ? AND section_id IS NULL')
        .get(projectRow.id) as { pos: number };
      
      // Create the page
      const result = db.prepare(`
        INSERT INTO pages (project_id, section_id, slug, title, content, position, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(projectRow.id, sectionId, title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64), title, content, maxPos.pos);
      
      const pageId = result.lastInsertRowid as number;
      
      // Create version entry for audit trail
      createPageVersion(db, pageId, content, title, user.id, isAiEdit);
      
      return text(
        `Page created successfully!\n\n` +
        `ID: ${pageId}\n` +
        `Slug: ${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64)}\n` +
        `Title: ${title}\n` +
        `Project: ${project}\n` +
        `Created by: ${user.email} (${isAiEdit ? 'AI' : 'Human'})`
      );
    }
  );
}

// ============================================================================
// WRITE TOOLS: update_page
// ============================================================================

function registerUpdatePageTool(server: McpServer) {
  server.registerTool(
    'update_page',
    {
      title: 'Update an existing documentation page',
      description:
        'Updates an existing documentation page. ' +
        'Creates a new version entry to track changes. ' +
        'Returns the updated page content.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        page: z.string().describe('Page slug to update'),
        content: z.string().optional().describe('New page content (markdown)'),
        title: z.string().optional().describe('New page title'),
        isAiEdit: z.boolean().optional().default(false).describe('Marks this as an AI-generated edit'),
        versionComment: z.string().optional().describe('Optional comment about this change'),
      },
    },
    async ({ project, page, content, title, isAiEdit = false, versionComment }, { _request }) => {
      const event = _request as unknown as H3Event;
      const user = await authenticateWriteAccess(event);
      
      const projectRow = getProjectBySlugSafe(project.trim());
      if (!projectRow) {
        return errorText(
          `No project with slug "${project}". Call list_projects to see available projects.`
        );
      }
      
      if (!hasProjectWriteAccess(projectRow.id, user.id, user.email)) {
        return errorText('You do not have permission to update pages in this project.');
      }
      
      const db = useDb();
      
      // Find the page
      const pageRow = db
        .prepare('SELECT id, content, title FROM pages WHERE project_id = ? AND slug = ?')
        .get(projectRow.id, page.trim()) as PageRow | undefined;
      
      if (!pageRow) {
        return errorText(
          `No page "${page}" in project "${project}". Call get_project to see available pages.`
        );
      }
      
      // Update the page
      const newContent = content ?? pageRow.content;
      const newTitle = title ?? pageRow.title;
      
      db.prepare(`
        UPDATE pages SET content = ?, title = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newContent, newTitle, pageRow.id);
      
      // Create version entry for audit trail
      createPageVersion(db, pageRow.id, newContent, newTitle, user.id, isAiEdit);
      
      return text(
        `Page updated successfully!\n\n` +
        `ID: ${pageRow.id}\n` +
        `Title: ${newTitle}\n` +
        `Last updated by: ${user.email} (${isAiEdit ? 'AI' : 'Human'})` +
        (versionComment ? `\nComment: ${versionComment}` : '')
      );
    }
  );
}

// ============================================================================
// WRITE TOOLS: create_section
// ============================================================================

function registerCreateSectionTool(server: McpServer) {
  server.registerTool(
    'create_section',
    {
      title: 'Create a new section in a documentation project',
      description:
        'Creates a new section to organize pages. ' +
        'Sections can contain other sections or pages.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        title: z.string().min(1).describe('Section title'),
        parent: z.string().optional().describe('Parent section slug (for nested sections)'),
      },
    },
    async ({ project, title, parent }, { _request }) => {
      const event = _request as unknown as H3Event;
      const user = await authenticateWriteAccess(event);
      
      const projectRow = getProjectBySlugSafe(project.trim());
      if (!projectRow) {
        return errorText(
          `No project with slug "${project}". Call list_projects to see available projects.`
        );
      }
      
      if (!hasProjectWriteAccess(projectRow.id, user.id, user.email)) {
        return errorText('You do not have permission to create sections in this project.');
      }
      
      const db = useDb();
      
      // Check if parent section exists
      let parentId: number | null = null;
      if (parent) {
        const parentSection = db
          .prepare('SELECT id FROM sections WHERE project_id = ? AND slug = ?')
          .get(projectRow.id, parent.trim());
        if (!parentSection) {
          return errorText(
            `No parent section with slug "${parent}". Call get_project to see available sections.`
          );
        }
        parentId = parentSection.id;
      }
      
      // Calculate position
      const maxPos = db
        .prepare('SELECT COALESCE(MAX(position), 0) + 1 as pos FROM sections WHERE project_id = ? AND parent_id IS NULL')
        .get(projectRow.id) as { pos: number };
      
      // Create the section
      const result = db.prepare(`
        INSERT INTO sections (project_id, parent_id, title, position)
        VALUES (?, ?, ?, ?)
      `).run(projectRow.id, parentId, title, maxPos.pos);
      
      return text(
        `Section created successfully!\n\n` +
        `ID: ${result.lastInsertRowid}\n` +
        `Title: ${title}\n` +
        `Project: ${project}\n` +
        `Created by: ${user.email}`
      );
    }
  );
}

// ============================================================================
// WRITE TOOLS: search_and_summarize (enhanced search with AI)
// ============================================================================

async function generateSummaryWithAI(prompt: string, temperature = 0.7): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const provider = process.env.AI_PROVIDER || 'openai';

  if (!apiKey) {
    throw new Error('AI API key not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  const messages = [
    { role: 'system', content: 'You are a helpful assistant that summarizes content concisely.' },
    { role: 'user', content: prompt },
  ];

  try {
    let response: Response;

    if (provider === 'openai') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 1000,
        }),
      });
    } else if (provider === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: 1000,
        }),
      });
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return provider === 'openai'
      ? data.choices[0].message.content
      : data.content[0].text;
  } catch (error) {
    console.error('AI summary generation error:', error);
    throw new Error(`Summary generation failed: ${error.message}`);
  }
}

function registerSearchAndSummarizeTool(server: McpServer) {
  server.registerTool(
    'search_and_summarize',
    {
      title: 'Search and generate AI summary',
      description:
        'Searches documentation and generates an AI summary of the results. ' +
        'Useful for answering questions about the documentation.',
      inputSchema: {
        query: z.string().describe('Search query'),
        project: z.string().optional().describe('Optional project slug to limit search'),
        maxResults: z.number().optional().default(5).describe('Maximum number of results to include in summary'),
        temperature: z.number().optional().default(0.7).describe('AI temperature for summary generation'),
      },
    },
    async ({ query, project, maxResults = 5, temperature = 0.7 }, { _request }) => {
      const db = useDb();
      const needle = query.trim();
      if (!needle) return errorText('Provide a non-empty search query.');
      
      const pattern = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const projectFilter = project?.trim();
      
      const rows = db.prepare(
        `
        SELECT p.slug AS project, pg.slug AS page, pg.title, pg.content
        FROM pages pg JOIN projects p ON p.id = pg.project_id
        WHERE ${projectFilter ? 'p.slug = ? AND' : ''}
          (pg.title LIKE ? ESCAPE '\\\\' OR pg.content LIKE ? ESCAPE '\\\\')
        ORDER BY p.slug, pg.slug LIMIT ?
      `
      ).all(...(projectFilter ? [projectFilter] : []), pattern, pattern, maxResults) as {
        project: string;
        page: string;
        title: string;
        content: string;
      }[];
      
      if (!rows.length) {
        return text(
          `No pages match "${needle}"${project ? ` in project "${project}"` : ''}.\n\n` +
          `Try searching for related terms or broaden your query.`
        );
      }
      
      // Build content for AI summary
      const searchResults = rows.map((row) => {
        const haystack = row.content.toLowerCase();
        const at = haystack.indexOf(needle.toLowerCase());
        const from = Math.max(0, at - SNIPPET_CONTEXT / 2);
        const snippet = row.content.slice(
          from,
          at + needle.length + SNIPPET_CONTEXT / 2
        );
        return `- ${row.title} (${row.project}/${row.page})\n  ...${snippet.replace(/\s+/g, ' ').trim()}...`;
      });
      
      const prompt = `Answer the question: "${needle}"
      
Here are the search results from the documentation:

${searchResults.join('\n\n')}

Please provide a concise summary of the answers found, including specific page references. 
Format your response in markdown.`;
      
      try {
        const summary = await generateSummaryWithAI(prompt, temperature);
        
        return text(
          `## Search Results Summary\n\n` +
          `**Query:** "${needle}"\n` +
          `**Results Found:** ${rows.length}\n\n` +
          `---\n\n` +
          `**AI Summary:**\n${summary}\n\n` +
          `---\n\n` +
          `**Detailed Results:**\n${searchResults.join('\n\n')}`
        );
      } catch (error) {
        // Fallback to just returning the search results if AI fails
        return text(
          `## Search Results\n\n` +
          `**Query:** "${needle}"\n` +
          `**Results Found:** ${rows.length}\n\n` +
          `**Note:** AI summary generation failed (${error.message}). Showing raw results:\n\n` +
          `${searchResults.join('\n\n')}`
        );
      }
    }
  );
}

// ============================================================================
// BUILD MCP SERVER WITH ALL TOOLS
// ============================================================================

function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'knowledgebook', version: '1.1.0' },
    {
      instructions:
        'Access to the documentation hosted on this KnowledgeBook instance. ' +
        'Available tools include read operations (list_projects, get_project, get_page, search) ' +
        'and write operations (create_page, update_page, create_section, search_and_summarize). ' +
        'Write operations require authentication and track changes with version history.',
    }
  );

  const db = useDb();

  // Register read-only tools (existing)
  server.registerTool(
    'list_projects',
    {
      title: 'List documentation projects',
      description:
        'Lists every documentation project on this KnowledgeBook instance with its slug, name and description.',
      inputSchema: {},
    },
    async () => {
      const projects = db
        .prepare(
          `
      SELECT p.slug, p.name, p.description, p.updated_at, COUNT(pg.id) AS page_count
      FROM projects p LEFT JOIN pages pg ON pg.project_id = p.id
      GROUP BY p.id ORDER BY p.name
    `
        )
        .all() as (ProjectRow & { page_count: number })[];
      if (!projects.length) return text('No documentation projects exist yet.');
      return text(
        projects
          .map(
            (p) =>
              `- ${p.name} (project: ${p.slug}) — ${p.page_count} pages${p.description ? ` — ${p.description}` : ''}`
          )
          .join('\n')
      );
    }
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get project structure',
      description:
        'Returns the section and page tree of a documentation project. Use the returned page slugs with get_page.',
      inputSchema: { project: z.string().describe('Project slug, as returned by list_projects') },
    },
    async ({ project }) => {
      const row = getProjectBySlugSafe(project.trim());
      if (!row)
        return errorText(
          `No project with slug "${project}". Call list_projects to see available projects.`
        );
      return text(projectStructure(row));
    }
  );

  server.registerTool(
    'get_page',
    {
      title: 'Read a documentation page',
      description: 'Returns the full markdown content of one documentation page.',
      inputSchema: {
        project: z.string().describe('Project slug'),
        page: z.string().describe('Page slug, as returned by get_project or search'),
      },
    },
    async ({ project, page }) => {
      const row = getProjectBySlugSafe(project.trim());
      if (!row)
        return errorText(
          `No project with slug "${project}". Call list_projects to see available projects.`
        );
      const pageRow = db
        .prepare('SELECT id, slug, title, content, updated_at FROM pages WHERE project_id = ? AND slug = ?')
        .get(row.id, page.trim()) as PageRow | undefined;
      if (!pageRow)
        return errorText(
          `No page "${page}" in project "${project}". Call get_project to see its pages.`
        );
      return text(
        `ID: ${pageRow.id}\nTitle: ${pageRow.title}\nProject: ${row.slug}\nPage: ${pageRow.slug}\nLast updated: ${pageRow.updated_at}\n\n${pageRow.content}`
      );
    }
  );

  server.registerTool(
    'search',
    {
      title: 'Search the documentation',
      description:
        'Full-text search across page titles and content. Returns matching pages with a snippet; read the full page with get_page.',
      inputSchema: {
        query: z.string().describe('Text to search for'),
        project: z
          .string()
          .optional()
          .describe('Optional project slug to limit the search to one project'),
      },
    },
    async ({ query, project }) => {
      const needle = query.trim();
      if (!needle) return errorText('Provide a non-empty search query.');
      const pattern = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const projectFilter = project?.trim();
      const rows = db
        .prepare(
          `
      SELECT p.slug AS project, pg.slug AS page, pg.title, pg.content
      FROM pages pg JOIN projects p ON p.id = pg.project_id
      WHERE ${projectFilter ? 'p.slug = ? AND' : ''}
        (pg.title LIKE ? ESCAPE '\\\\' OR pg.content LIKE ? ESCAPE '\\\\')
      ORDER BY p.slug, pg.slug LIMIT ${MAX_SEARCH_RESULTS + 1}
    `
        )
        .all(...(projectFilter ? [projectFilter] : []), pattern, pattern) as {
          project: string;
          page: string;
          title: string;
          content: string;
        }[];

      if (!rows.length)
        return text(`No pages match "${needle}"${project ? ` in project "${project}"` : ''}.`);
      const results = rows.slice(0, MAX_SEARCH_RESULTS).map((row) => {
        const haystack = row.content.toLowerCase();
        const at = haystack.indexOf(needle.toLowerCase());
        const from = Math.max(0, at - SNIPPET_CONTEXT / 2);
        const snippet =
          at === -1
            ? row.content.slice(0, SNIPPET_CONTEXT)
            : row.content.slice(from, at + needle.length + SNIPPET_CONTEXT / 2);
        return `- ${row.title} (project: ${row.project}, page: ${row.page})\n  ...${snippet.replace(/\s+/g, ' ').trim()}...`;
      });
      if (rows.length > MAX_SEARCH_RESULTS)
        results.push(
          `(more results exist — refine the query${project ? '' : ' or limit it to one project'})`
        );
      return text(results.join('\n'));
    }
  );

  // Register write-capable tools (new)
  registerCreatePageTool(server);
  registerUpdatePageTool(server);
  registerCreateSectionTool(server);
  registerSearchAndSummarizeTool(server);

  return server;
}

// ============================================================================
// EXPORT HANDLER
// ============================================================================

export default defineEventHandler(async (event) => {
  // Restrict CORS to known origins for security.
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  const origin = event.headers.get('origin');
  const isAllowedOrigin = origin ? allowedOrigins.includes(origin) : false;

  setResponseHeaders(event, {
    'access-control-allow-origin': isAllowedOrigin ? origin : undefined,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version',
    'access-control-expose-headers': 'mcp-session-id',
  });
  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204);
    return null;
  }
  if (event.method !== 'POST') {
    setResponseStatus(event, 405);
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'This MCP server is stateless: send JSON-RPC requests via POST.',
      },
      id: null,
    };
  }

  // The server runs statelessly: a fresh server + transport pair per request,
  // no session ids, plain JSON responses (no SSE stream to keep open).
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  // Rebuild the request with the dual accept header the transport insists on —
  // several MCP clients send a plain `accept: application/json`.
  const original = toWebRequest(event);
  const headers = new Headers(original.headers);
  headers.set('accept', 'application/json, text/event-stream');
  const request = new Request(original.url, {
    method: original.method,
    headers,
    body: original.body,
    // Node's fetch requires this when the body is a stream.
    duplex: 'half',
  } as RequestInit);

  return await transport.handleRequest(request);
});
