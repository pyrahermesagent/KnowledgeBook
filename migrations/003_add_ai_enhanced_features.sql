-- Migration: Add AI-Enhanced Documentation Features
-- Creates tables for smart content generation, Q&A, translation, and analytics

-- ============================================================================
-- Content Generation Sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_generation_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  outline         TEXT NOT NULL,
  generated_content TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  provider        TEXT NOT NULL DEFAULT 'openai',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);

-- ============================================================================
-- Code Examples Cache
-- ============================================================================
CREATE TABLE IF NOT EXISTS code_examples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language        TEXT NOT NULL,
  category        TEXT NOT NULL,
  code            TEXT NOT NULL,
  description     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, language, category)
);

-- ============================================================================
-- Documentation Q&A Pairs
-- ============================================================================
CREATE TABLE IF NOT EXISTS doc_qa_pairs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 0.0,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for quick Q&A lookup
CREATE INDEX IF NOT EXISTS idx_doc_qa_project ON doc_qa_pairs(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_qa_question ON doc_qa_pairs(question);

-- ============================================================================
-- Content Styles Configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_styles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  voice           TEXT NOT NULL,
  vocabulary      TEXT,
  avoid_words     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, name)
);

-- ============================================================================
-- Translations
-- ============================================================================
CREATE TABLE IF NOT EXISTS translations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  source_lang     TEXT NOT NULL,
  target_lang     TEXT NOT NULL,
  translated_content TEXT NOT NULL,
  quality_score   REAL,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewer_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  UNIQUE (project_id, page_id, target_lang, status)
);

-- Index for translation lookups
CREATE INDEX IF NOT EXISTS idx_translations_project ON translations(project_id);
CREATE INDEX IF NOT EXISTS idx_translations_page ON translations(page_id);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON translations(target_lang);

-- ============================================================================
-- Translation Memory (reusable segments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS translation_memory (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_text     TEXT NOT NULL,
  target_text     TEXT NOT NULL,
  target_lang     TEXT NOT NULL,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, source_text, target_lang)
);

-- ============================================================================
-- Page Views Tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS page_views (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  view_timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
  visitor_id      TEXT,
  session_id      TEXT,
  duration_ms     INTEGER,
  referral        TEXT
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_page_views_project ON page_views(project_id, view_timestamp);
CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page_id, view_timestamp);

-- ============================================================================
-- Content Metrics (daily aggregations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_metrics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  metric_date     TEXT NOT NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  avg_duration    INTEGER,
  completion_rate REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, page_id, metric_date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_content_metrics_date ON content_metrics(metric_date);

-- ============================================================================
-- Content Gaps Detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_gaps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_title   TEXT NOT NULL,
  content_length  INTEGER NOT NULL DEFAULT 0,
  gap_type        TEXT NOT NULL,
  suggestion      TEXT,
  severity        TEXT NOT NULL DEFAULT 'low',
  resolved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for gap queries
CREATE INDEX IF NOT EXISTS idx_content_gaps_project ON content_gaps(project_id, severity);

-- ============================================================================
-- AI-Enhanced MCP Tools Table (for tracking tool usage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_mcp_tool_usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name       TEXT NOT NULL,
  project_id      INTEGER REFERENCES projects(id),
  user_id         INTEGER REFERENCES users(id),
  parameters      TEXT,
  response_time_ms INTEGER,
  success       BOOLEAN NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for usage analytics
CREATE INDEX IF NOT EXISTS idx_ai_mcp_usage_tool ON ai_mcp_tool_usage(tool_name, created_at);
