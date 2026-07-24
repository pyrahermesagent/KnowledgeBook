# Theming Engine

This directory contains the theme schema, examples, and migration files for KnowledgeBook's theming engine.

## Structure

- `schema.md` - JSON schema and API specification
- `migrations/` - Database migration scripts
- `examples/` - Example theme JSON files

## API Endpoints (Proposed)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/themes` | List all themes |
| GET | `/api/themes/:id` | Get theme by ID |
| POST | `/api/themes` | Create a theme |
| PATCH | `/api/themes/:id` | Update a theme |
| DELETE | `/api/themes/:id` | Delete a theme |
| POST | `/api/projects/:slug/apply-theme` | Apply theme to project |
| GET | `/api/projects/:slug/theme` | Get effective project theme |
| GET | `/api/projects/:slug/available-themes` | Get themes available to apply |

## Next Steps

1. Implement database migrations
2. Create API endpoints for theme CRUD
3. Build frontend components for theme preview and selection
4. Implement theme application and CSS variable injection
5. Add admin UI for theme customization
