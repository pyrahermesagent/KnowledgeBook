# 📖 KnowledgeBook

A GitBook-inspired documentation platform built with **Vue / Nuxt 3**. Create documentation
projects with sections and pages, write in full markdown, and share them at a clean
`/<project-name>` link. Edits autosave as you type.

## Features

- **Google sign-in** — owners authenticate with their Google account (OAuth 2.0)
- **Projects at `/<name>`** — each project gets its own public link
- **Sections & pages** — organize content in a GitBook-style sidebar tree
- **Full markdown** — tables, code blocks with syntax highlighting, images, quotes, lists
- **Autosave** — edits are saved automatically with a live status indicator
- **Uploads to Hetzner Object Storage** — images and files go to S3-compatible storage
  (falls back to local disk when S3 is not configured)
- **Customization** — per-project accent color, icon, name and description
- **SQLite** persistence, **Docker** deployment, **GitHub Actions** image publishing

## Development

```sh
cp .env.example .env   # fill in Google OAuth credentials + session password
npm install
npm run dev
```

Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
with the redirect URI `http://localhost:3000/api/auth/google` (use your production origin in prod).

## Configuration

All secrets live in `.env` (see [.env.example](.env.example)):

| Variable | Purpose |
| --- | --- |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` / `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `NUXT_SESSION_PASSWORD` | Cookie encryption key (32+ random chars) |
| `NUXT_DATABASE_PATH` | SQLite database file location |
| `NUXT_S3_ENDPOINT`, `NUXT_S3_REGION`, `NUXT_S3_BUCKET`, `NUXT_S3_ACCESS_KEY`, `NUXT_S3_SECRET_KEY` | Hetzner Object Storage (S3-compatible) |
| `NUXT_S3_PUBLIC_URL` | Optional public base URL for uploaded objects |
| `NUXT_UPLOADS_DIR` | Local-disk upload fallback directory |

## Deployment

Every push to `main` builds the app and publishes a Docker image to GitHub Container
Registry via [GitHub Actions](.github/workflows/publish.yml).

```sh
docker compose up -d        # builds locally, persists data in a named volume
# or pull the published image:
docker run -d -p 3000:3000 --env-file .env -v knowledgebook-data:/app/.data \
  ghcr.io/<owner>/knowledgebook:latest
```

The SQLite database and local uploads live in the `/app/.data` volume.

## Architecture

- `server/api/**` — Nitro REST API (projects, sections, pages, uploads, auth)
- `server/utils/` — SQLite access, S3/local storage abstraction, auth helpers
- `pages/dashboard/**` — authenticated dashboard and markdown editor
- `pages/[project]/**` — public documentation viewer
- `components/` — markdown renderer, docs shell, project icon
