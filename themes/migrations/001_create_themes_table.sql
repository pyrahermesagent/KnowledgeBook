-- Add themes table
CREATE TABLE IF NOT EXISTS themes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL CHECK(type IN ('system', 'project')),
  parent_id   TEXT REFERENCES themes(id),
  config      JSONB NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add project_themes table for project-theme associations
CREATE TABLE IF NOT EXISTS project_themes (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES themes(id),
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, theme_id)
);

-- Add theme_id column to projects table
ALTER TABLE projects ADD COLUMN theme_id TEXT REFERENCES themes(id);

-- Migration: Create default system themes
INSERT INTO themes (id, name, slug, type, config, is_default)
VALUES 
  ('theme_sys_default', 'Default', 'default', 'system', '{"colors": {"accent": "#346ddb", "accentSoft": "#e0ecf9", "background": "#ffffff", "bgSubtle": "#f7f8fa", "border": "#e5e8ec", "text": "#1f2430", "textMuted": "#6b7280"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "mono": "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', TRUE),
  ('theme_sys_midnight', 'Midnight', 'midnight', 'system', '{"colors": {"accent": "#8b5cf6", "accentSoft": "#5b3784", "background": "#0f172a", "bgSubtle": "#1e293b", "border": "#334155", "text": "#f1f5f9", "textMuted": "#94a3b8"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "mono": "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', FALSE),
  ('theme_sys_ocean', 'Ocean Breeze', 'ocean', 'system', '{"colors": {"accent": "#06b6d4", "accentSoft": "#0e7490", "background": "#ecfeff", "bgSubtle": "#cffafe", "border": "#a5f3fc", "text": "#0c4a6e", "textMuted": "#075985"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "mono": "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', FALSE);

-- Set project_id to theme_id for existing projects (migrate existing accent_color)
-- This will be handled in a separate migration step if needed
