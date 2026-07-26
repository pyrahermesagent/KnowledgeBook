-- Theme Engine Database Schema
-- Migration 004: Create themes tables

-- Themes table for system and project-specific themes
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

-- Project themes junction table for applying themes to projects
CREATE TABLE IF NOT EXISTS project_themes (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES themes(id),
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, theme_id)
);

-- Create index for project theme lookups
CREATE INDEX IF NOT EXISTS idx_project_themes_project ON project_themes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_themes_theme ON project_themes(theme_id);

-- Insert default system themes
INSERT INTO themes (id, name, slug, type, config, is_default) VALUES
  ('sys-default', 'Default', 'default', 'system', '{"colors": {"accent": "#346ddb", "background": "#ffffff", "border": "#e5e8ec", "text": "#1f2430", "textMuted": "#6b7280", "primary": "#346ddb"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', TRUE),
  ('sys-midnight', 'Midnight', 'midnight', 'system', '{"colors": {"accent": "#8b5cf6", "background": "#0f172a", "border": "#1e293b", "text": "#f1f5f9", "textMuted": "#94a3b8", "primary": "#8b5cf6"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', FALSE),
  ('sys-ocean', 'Ocean Breeze', 'ocean', 'system', '{"colors": {"accent": "#06b6d4", "background": "#ecfeff", "border": "#cffafe", "text": "#0c4a6e", "textMuted": "#0f766e", "primary": "#06b6d4"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}', FALSE);

-- Insert default project themes
INSERT INTO themes (id, name, slug, type, config) VALUES
  ('sys-forest', 'Forest', 'forest', 'system', '{"colors": {"accent": "#10b981", "background": "#f0fdf4", "border": "#dcfce7", "text": "#166534", "textMuted": "#15803d", "primary": "#10b981"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}'),
  ('sys-sunset', 'Sunset', 'sunset', 'system', '{"colors": {"accent": "#f97316", "background": "#fff7ed", "border": "#ffedd5", "text": "#9a3412", "textMuted": "#c2410c", "primary": "#f97316"}, "typography": {"fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif", "fontSize": 16, "lineHeight": 1.6}, "layout": {"sidebarWidth": 280, "sidebarPosition": "left", "headerHeight": 60, "footerVisible": true, "stickyHeader": true}, "spacing": {"unit": 8, "scale": "normal"}}');
