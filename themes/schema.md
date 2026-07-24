# Theme Engine Schema Design

## Overview

This document defines the theme schema and API for KnowledgeBook's theming engine. The system supports both **system-wide default themes** and **per-project custom themes**.

## Core Concepts

- **Theme**: A complete visual configuration including colors, typography, spacing, and layout
- **Theme Palette**: A named set of colors (e.g., "Material", "Forest", "Ocean")
- **Theme Instance**: A specific theme applied to a project or system
- **CSS Variables**: Runtime theme application via CSS custom properties

## JSON Schema (theme.json)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1, "maxLength": 50 },
    "slug": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "type": { "type": "string", "enum": ["system", "project"], "default": "system" },
    "parentId": { "type": "string", "nullable": true },
    "colors": { "$ref": "#/$defs/ColorPalette" },
    "typography": { "$ref": "#/$defs/TypographyConfig" },
    "layout": { "$ref": "#/$defs/LayoutConfig" },
    "spacing": { "$ref": "#/$defs/SpacingConfig" },
    "components": { "$ref": "#/$defs/ComponentStyles" },
    "isDefault": { "type": "boolean", "default": false },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "required": ["name", "colors"],
  "$defs": {
    "ColorPalette": {
      "type": "object",
      "properties": {
        "primary": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#346ddb" },
        "primaryHover": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "secondary": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "secondaryHover": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "accent": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "accentSoft": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "background": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#ffffff" },
        "bgSubtle": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#f7f8fa" },
        "surface": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#ffffff" },
        "border": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#e5e8ec" },
        "text": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#1f2430" },
        "textMuted": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "default": "#6b7280" }
      },
      "required": ["accent", "background", "border", "text"]
    },
    "TypographyConfig": {
      "type": "object",
      "properties": {
        "fontFamily": { "type": "string", "default": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif" },
        "mono": { "type": "string", "default": "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, monospace" },
        "fontSize": { "type": "number", "minimum": 12, "maximum": 24, "default": 16 },
        "lineHeight": { "type": "number", "minimum": 1.2, "maximum": 2.0, "default": 1.6 },
        "headingScale": { "type": "array", "items": { "type": "number" }, "default": [2.0, 1.45, 1.15] }
      },
      "required": ["fontFamily"]
    },
    "LayoutConfig": {
      "type": "object",
      "properties": {
        "sidebarWidth": { "type": "number", "minimum": 200, "maximum": 500, "default": 280 },
        "sidebarPosition": { "type": "string", "enum": ["left", "right", "top"], "default": "left" },
        "headerHeight": { "type": "number", "minimum": 40, "maximum": 100, "default": 60 },
        "footerVisible": { "type": "boolean", "default": true },
        "stickyHeader": { "type": "boolean", "default": true }
      }
    },
    "SpacingConfig": {
      "type": "object",
      "properties": {
        "unit": { "type": "number", "minimum": 4, "maximum": 32, "default": 8 },
        "scale": { "type": "string", "enum": ["compact", "normal", "spacious"], "default": "normal" }
      },
      "required": ["unit"]
    },
    "ComponentStyles": {
      "type": "object",
      "properties": {
        "button": { "$ref": "#/$defs/ComponentStyle" },
        "card": { "$ref": "#/$defs/ComponentStyle" },
        "input": { "$ref": "#/$defs/ComponentStyle" },
        "modal": { "$ref": "#/$defs/ComponentStyle" }
      }
    },
    "ComponentStyle": {
      "type": "object",
      "properties": {
        "borderRadius": { "type": "number", "minimum": 0, "maximum": 32, "default": 8 },
        "padding": { "type": "string", "default": "8px 16px" },
        "shadow": { "type": "string", "default": "0 2px 8px rgba(0,0,0,0.08)" }
      },
      "required": ["borderRadius"]
    }
  }
}
```

## REST API

### List Themes

```
GET /api/themes
```

Response:
```json
{
  "themes": [
    {
      "id": "sys-default",
      "name": "Default",
      "type": "system",
      "isDefault": true,
      "colors": { "accent": "#346ddb", "background": "#ffffff", ... },
      "updatedAt": "2026-07-20T12:00:00Z"
    }
  ]
}
```

### Get Theme

```
GET /api/themes/:id
```

### Create Theme

```
POST /api/themes
Body: Theme (without id, createdAt, updatedAt)
```

### Update Theme

```
PATCH /api/themes/:id
Body: Partial<Theme>
```

### Delete Theme

```
DELETE /api/themes/:id
```

### Apply Theme to Project

```
POST /api/projects/:slug/apply-theme
Body: { themeId: string }
```

### Get Project Theme

```
GET /api/projects/:slug/theme
```

Response includes the effective theme (project-specific or inherited system default).

## Database Schema

### themes table
```sql
CREATE TABLE themes (
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
```

### project_themes table
```sql
CREATE TABLE project_themes (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES themes(id),
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, theme_id)
);
```

## CSS Variable Generation

Themes are converted to CSS variables at runtime:

```css
:root {
  --accent: #346ddb;
  --accent-soft: color-mix(in srgb, var(--accent) 12%, transparent);
  --background: #ffffff;
  --bg-subtle: #f7f8fa;
  --border: #e5e8ec;
  --text: #1f2430;
  --text-muted: #6b7280;
  --sidebar-width: 280px;
  --radius: 8px;
}
```

## Theme Inheritance

1. Projects start with no theme applied (use system defaults)
2. Apply a theme to a project to override system defaults
3. System themes cannot be modified, only cloned
4. Project themes are isolated to that project

## Example Themes

### Minimal Light
- Primary: #3b82f6
- Background: #ffffff
- Border: #e5e7eb
- Text: #111827

### Midnight Dark
- Primary: #8b5cf6
- Background: #0f172a
- Border: #1e293b
- Text: #f1f5f9

### Ocean Breeze
- Primary: #06b6d4
- Background: #ecfeff
- Border: #cffafe
- Text: #0c4a6e
