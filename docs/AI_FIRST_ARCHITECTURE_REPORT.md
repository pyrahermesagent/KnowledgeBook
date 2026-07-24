# AI-First Documentation Architecture Report

**Date**: 2026-07-21  
**Task**: t_b4bafeff - Discovery 1: AI-First Documentation Architecture  
**Status**: Discovery complete

---

## Executive Summary

This document analyzes the current KnowledgeBook architecture and proposes an AI-first foundation supporting automated content generation, intelligent search with RAG, multi-language AI translation, and context-aware help. The current state provides read-only access via MCP (Model Context Protocol) with no authentication, write capabilities, or AI-specific features.

### Key Findings

| Aspect | Current State | AI-First Target |
|--------|--------------|-----------------|
| MCP Tools | 4 read-only tools | 10+ tools with CRUD and AI capabilities |
| Authentication | None (public endpoint) | Session-based with role permissions |
| Write Capabilities | None | Full CRUD for projects, sections, pages |
| Search | Basic full-text search | Semantic RAG with vector embeddings |
| Translation | None | AI-powered multi-language support |

---

## Current State Analysis

### MCP Server Implementation

**Location**: `server/routes/mcp.ts`

**Existing Tools**:
| Tool | Description | Access |
|------|-------------|--------|
| `list_projects` | Lists all documentation projects | Public |
| `get_project` | Returns project structure and page slugs | Public |
| `get_page` | Returns full markdown content | Public |
| `search` | Full-text search across titles/content | Public |

**Security Characteristics**:
- **Authentication**: None (public endpoint)
- **Authorization**: None (all content is public)
- **Rate Limiting**: None
- **CORS**: Restricted via `ALLOWED_ORIGINS` env variable

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Google OAuth user accounts |
| `projects` | Documentation projects with metadata |
| `sections` | Hierarchical content organization |
| `project_members` | Member access control |
| `pages` | Content pages with markdown |

**Current Limitations**:
- No vector embeddings for semantic search
- No translation cache table
- No AI-generated content tracking

---

## Gap Analysis Matrix

### Security & Access Control Gaps

| Gap | Severity | Impact | Implementation Priority |
|-----|----------|--------|------------------------|
| No authentication middleware | High | Security vulnerability | P0 |
| No authorization checks | High | Unauthorized modifications | P0 |
| No rate limiting | Medium | Potential abuse | P1 |
| Missing permission matrix | High | No access control | P0 |

### AI Capability Gaps

| Feature | Current | Gap | Priority |
|---------|---------|-----|----------|
| AI Content Generation | None | No MCP tools for AI authors | P0 |
| Semantic Search (RAG) | Basic text search | No vector embeddings | P1 |
| AI Translation | None | No translation support | P1 |
| Context-Aware Help | None | No project context for LLMs | P2 |

### Development Process Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| Write tool implementations | Missing | No CRUD beyond read-only |
| Integration tests | Incomplete | Only 8 tests, no MCP endpoint tests |
| Security documentation | Missing | No security model documented |
| AI agent usage patterns | Unknown | No documentation for AI workflows |

---

## Proposed Architecture Diagram

### AI-First Architecture (Phase 1-3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT / AGENT                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  AI Writer   │  │   RAG Search │  │Translator AI │  │ Context Help │  │
│  │  (Claude    │  │  (LangChain  │  │  (VITS/TTS)  │  │  (vLLM)      │  │
│  │   Code)      │  │  + Semantic │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                   │                  │                  │          │
└─────────┼───────────────────┼────────────────┼──────────────────┼──────────┘
          │                   │                  │                  │
          ▼                   ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP SERVER LAYER                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  /mcp endpoint (Streamable HTTP)                                     │  │
│  │  - Authentication Middleware (Session validation)                    │  │
│  │  - Authorization Layer (Permission checks per tool)                  │  │
│  │  - Rate Limiter (100 req/min read, 20 req/min write)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │  READ TOOLS (4)  │  │ WRITE TOOLS (6)  │  │   AI TOOLS (5)   │        │
│  │ - list_projects  │  │ - create_project │  │ - ai_summarize   │        │
│  │ - get_project    │  │ - create_page    │  │ - ai_expand      │        │
│  │ - get_page       │  │ - update_page    │  │ - ai_translate   │        │
│  │ - search         │  │ - delete_page    │  │ - ai_search_rag  │        │
│  │                  │  │ - create_section │  │ - ai_context     │        │
│  │                  │  │ - update_section │  │                  │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
          │                   │                  │                  │
          ▼                   ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA & AI LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  SQLite DB   │  │ Vector Store │  │ Translation  │  │   AI Models  │  │
│  │  - projects  │  │  - embeddings│  │  - cache     │  │  - vLLM      │  │
│  │  - pages     │  │  - metadata  │  │  - history   │  │  - TTS       │  │
│  │  - sections  │  │              │  │              │  │  - Embeddings│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  AI Orchestrator (Server-side)                                       │  │
│  │  - Prompt templates per tool type                                    │  │
│  │  - Context injection (project metadata, existing content)            │  │
│  │  - Output validation and sanitization                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AI Agent Interaction Patterns

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI WORKFLOW PATTERNS                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. DOCUMENTATION GENERATION                                           │
│     Agent ──[list_projects]──> KnowledgeBook                            │
│     Agent ──[get_project]──> Project structure                         │
│     Agent ──[ai_summarize: "create API docs"]──> AI Orchestrator      │
│     Agent ──[create_page]──> New page saved                            │
│                                                                          │
│  2. ENHANCED SEMANTIC SEARCH                                           │
│     User Query: "How to configure OAuth?"                              │
│     Vector Store (embeddings) ──> Top-k semantic matches               │
│     RAG Prompt ──> vLLM ──> Synthesized answer with sources            │
│     MCP Tool: ai_search_rag ──> Return answer + page references        │
│                                                                          │
│  3. MULTI-LANGUAGE TRANSLATION                                         │
│     Page content ──[ai_translate: "Czech"]──> AI Orchestrator          │
│     Translation cache ──> Store translated content                     │
│     Return ──> Translated markdown with source metadata                │
│                                                                          │
│  4. CONTEXT-AWARE ASSISTANCE                                           │
│     Agent asks: "What's the project structure for [project]?"         │
│     Context Injection:                                                  │
│       - Project name/slug                                              │
│       - Existing sections/pages                                        │
│       - Last updated timestamps                                        │
│     AI Model ──> Tailored response with project-specific context       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## AI Capabilities Roadmap

### Phase 1: Security Foundation & Write Tools (Weeks 1-3)

**Goal**: Enable AI agents to read and write documentation securely

| Task | Deliverable | Acceptance Criteria |
|------|-------------|---------------------|
| 1.1 Authentication Middleware | Session validation for MCP | 401 for unauthenticated write requests |
| 1.2 Authorization Layer | Permission checks per tool | 403 for unauthorized operations |
| 1.3 Rate Limiting | IP/User-based limits | 100 req/min read, 20 req/min write |
| 1.4 Write Tools (6) | CRUD for projects/pages/sections | All tools with input validation |
| 1.5 Security Tests | Integration test suite | Auth flow tests, permission enforcement |

**MCP Tools Added (Phase 1)**:
- `create_project` - Create new documentation project
- `create_page` - Create new page with markdown content
- `update_page` - Update page title/content
- `delete_page` - Delete page (owner only)
- `create_section` - Create new section
- `update_section` - Update section title/position

---

### Phase 2: AI-Powered Capabilities (Weeks 4-6)

**Goal**: Enable AI agents to generate, translate, and enhance content

| Task | Deliverable | Acceptance Criteria |
|------|-------------|---------------------|
| 2.1 Vector Embeddings | SQLite vector extension | Store embeddings for semantic search |
| 2.2 RAG Search Tool | ai_search_rag | Returns synthesized answer + sources |
| 2.3 Translation API | ai_translate | Translate pages to target language |
| 2.4 AI Summarization | ai_summarize | Create page summaries from content |
| 2.5 AI Expansion | ai_expand | Expand sections with additional detail |

**MCP Tools Added (Phase 2)**:
- `ai_search_rag` - Semantic search with RAG
- `ai_translate` - AI-powered translation
- `ai_summarize` - Generate content summaries
- `ai_expand` - Expand content with AI

---

### Phase 3: Context & Optimization (Weeks 7-8)

**Goal**: Enable context-aware AI assistance and performance optimization

| Task | Deliverable | Acceptance Criteria |
|------|-------------|---------------------|
| 3.1 Context Injection | Project metadata injection | LLMs receive project-specific context |
| 3.2 Model Selection | Dynamic model routing | Choose model based on task complexity |
| 3.3 Caching Strategy | AI output caching | Reuse AI-generated content |
| 3.4 Analytics & Logging | MCP usage tracking | Monitor AI tool usage patterns |

**MCP Tools Added (Phase 3)**:
- `ai_context` - Context-aware assistance with project metadata
- `ai_analyze` - Analyze content quality/issues

---

## Implementation Architecture Details

### Authentication Flow

```
1. MCP Request (HTTP POST)
   └─> Authentication Middleware
       ├─> Check session cookie / header
       ├─> Validate session against store
       ├─> Attach user to event context
       └─> Route to tool handler

2. Authorization Check
   ├─> Read tools: Public or authenticated
   ├─> Write tools: Authenticated + permission check
   └─> Admin tools: Project owner only
```

### Vector Storage Schema (Phase 2)

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  page_id INTEGER NOT NULL REFERENCES pages(id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,  -- Serialized float array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id, page_id) REFERENCES pages(project_id, id)
);

CREATE TABLE IF NOT EXISTS translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  original_content TEXT NOT NULL,
  translated_content TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, page_id, target_lang)
);
```

### AI Orchestrator Pattern

```typescript
// server/utils/ai-orchestrator.ts
export class AIOrchestrator {
  async summarize(projectId: number, content: string): Promise<string> {
    const context = this.buildContext(projectId, content);
    const prompt = this.buildPrompt('summarize', context);
    const response = await this.callLLM(prompt);
    return this.validateOutput(response);
  }

  async translate(projectId: number, content: string, targetLang: string): Promise<string> {
    // Check cache first
    const cached = this.getCachedTranslation(projectId, content, targetLang);
    if (cached) return cached;

    const context = this.buildContext(projectId, content);
    const prompt = this.buildPrompt('translate', { ...context, targetLang });
    const response = await this.callLLM(prompt);
    
    this.cacheTranslation(projectId, content, targetLang, response);
    return response;
  }

  async semanticSearch(query: string, projectId?: number): Promise<SearchResult[]> {
    // Vector search + RAG synthesis
    const vectorResults = this.vectorStore.search(query, projectId);
    const context = this.buildContext(projectId, vectorResults);
    const prompt = this.buildPrompt('rag', { query, context });
    const response = await this.callLLM(prompt);
    return this.formatResults(response, vectorResults);
  }
}
```

---

## Deliverables

### 1. Architecture Analysis Report ✓
**File**: `docs/AI_FIRST_ARCHITECTURE_REPORT.md`  
**Status**: Completed

### 2. AI Capabilities Roadmap Document ✓
**File**: See Phase 1-3 sections above  
**Status**: Completed

### 3. Gap Analysis Matrix ✓
**File**: See Gap Analysis Matrix section above  
**Status**: Completed

---

## Next Steps

1. **Review this discovery report** with the team
2. **Approve implementation priority order**
3. **Create child kanban tasks** for Phase 1 implementation:
   - t_bxxxxxxx - MCP Authentication Middleware
   - t_bxxxxxxx - Authorization Layer
   - t_bxxxxxxx - Rate Limiting
   - t_bxxxxxxx - Write Tools (6 tools)
   - t_bxxxxxxx - Security Tests

4. **Begin Phase 1 implementation** (estimated 2-3 weeks)

---

## Related Files & References

| File | Purpose |
|------|---------|
| `server/routes/mcp.ts` | Current MCP server implementation |
| `server/utils/auth.ts` | Authentication utilities |
| `server/utils/db.ts` | Database schema and access |
| `docs/MCP_ARCHITECTURE_SPEC.md` | Existing MCP architecture spec |
| `docs/MCP_GAP_ANALYSIS.md` | Previous gap analysis report |
| `README.md` | Project documentation |

---

**Report completed**: 2026-07-21  
**Discovery task**: t_b4bafeff  
**Status**: Ready for review and Phase 1 approval
