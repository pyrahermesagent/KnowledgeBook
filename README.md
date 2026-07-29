# 📖 KnowledgeBook

A GitBook-inspired documentation platform built with **Vue / Nuxt 3**. Create documentation
projects with sections and pages, write in full markdown, and share them at a clean
`/<project-name>` link. Edits autosave as you type.

## Features

- **Sign in with Google or a wallet** — Google (OAuth 2.0), or an Ethereum, Solana or
  Polkadot wallet browser extension; every sign-in method resolves to one account (see
  [Authentication](#authentication))
- **Projects at `/<name>`** — each project gets its own public link
- **Sections & pages** — organize content in a GitBook-style sidebar tree
- **Import from GitBook** — paste a published GitBook site's URL and its whole
  structure and content are imported as a new project (uses the site's `llms.txt`
  and markdown exports; GitBook-specific syntax is converted to plain markdown)
- **MCP server for AI agents** — every instance exposes its documentation over
  the Model Context Protocol at `/mcp` (see [AI agents](#ai-agents-mcp))
- **Teams** — invite people to a project by Google email or by wallet address; members
  edit content and manage the member list, while the single non-removable admin
  (the project creator) is the only one who can delete the project
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

| Variable                                                                                           | Purpose                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` / `NUXT_OAUTH_GOOGLE_CLIENT_SECRET`                                  | Google OAuth credentials                                                                                                                                |
| `NUXT_OAUTH_GOOGLE_REDIRECT_URL`                                                                   | Public OAuth callback URL, e.g. `https://knowledgebook.plutolabs.app/api/auth/google`. Required behind a reverse proxy to avoid `redirect_uri_mismatch` |
| `NUXT_SESSION_PASSWORD`                                                                            | Cookie encryption key (32+ random chars)                                                                                                                |
| `NUXT_DATABASE_PATH`                                                                               | SQLite database file location                                                                                                                           |
| `NUXT_S3_ENDPOINT`, `NUXT_S3_REGION`, `NUXT_S3_BUCKET`, `NUXT_S3_ACCESS_KEY`, `NUXT_S3_SECRET_KEY` | Hetzner Object Storage (S3-compatible)                                                                                                                  |
| `NUXT_S3_PUBLIC_URL`                                                                               | Optional public base URL for uploaded objects                                                                                                           |
| `NUXT_UPLOADS_DIR`                                                                                 | Local-disk upload fallback directory                                                                                                                    |

### Authentication

Sign in with a Google account, or with an Ethereum, Solana or Polkadot wallet browser
extension — e.g. MetaMask, Rabby or Coinbase Wallet (Ethereum), Phantom, Solflare or
Backpack (Solana), and Talisman, SubWallet or polkadot.js (Polkadot). Every sign-in
method resolves to **one account**: connecting a wallet while already signed in links it
to the account you're signed into, and linked login methods are managed at
`/dashboard/account`.

Wallet sign-in uses browser extensions, so it needs a desktop browser or a wallet app's
built-in browser. There is no WalletConnect/QR support, so a regular mobile browser
can't use it.

**Known limitation:** the account page has no "Link Google" control. Linking still works
server-side — signing in with Google while holding a wallet session links the two to one
account — but `server/api/auth/google.get.ts` always redirects to `/dashboard` on
success, so a link button on the account page would just bounce the user away instead of
leaving them there to see the result. A wallet-only user therefore has no in-page control
to add a Google login today; the reverse (wallet added from an account already signed in
with Google) works fully.

| Variable                  | Purpose                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `NUXT_WEB3_EVM_CHAIN_IDS` | Comma-separated EIP-155 chain ids accepted at sign-in (default `1,10,137,8453,42161`) |
| `NUXT_WEB3_APP_DOMAIN`    | Domain bound into every login message and re-checked server-side                      |
| `NUXT_WEB3_APP_URI`       | URI bound into every login message                                                    |

## AI agents (MCP)

The documentation is readable by AI agents through the
[Model Context Protocol](https://modelcontextprotocol.io). A stateless
Streamable HTTP MCP server runs at **`/mcp`** and exposes read-only tools over
the same public content as the docs pages:

| Tool            | Purpose                                                            |
| --------------- | ------------------------------------------------------------------ |
| `list_projects` | Discover the documentation projects on this instance               |
| `get_project`   | Section/page tree of one project (returns page slugs)              |
| `get_page`      | Full markdown content of a page                                    |
| `search`        | Full-text search across titles and content, optionally per project |

Connect from Claude Code:

```sh
claude mcp add --transport http knowledgebook https://knowledgebook.plutolabs.app/mcp
```

or from any MCP client supporting Streamable HTTP:

```json
{
  "mcpServers": {
    "knowledgebook": { "type": "http", "url": "https://knowledgebook.plutolabs.app/mcp" }
  }
}
```

No authentication is required — the server exposes exactly what the public
documentation pages already show.

## Deployment

Every push to `main` runs [GitHub Actions](.github/workflows/publish.yml), which:

1. builds the app and publishes a Docker image to GitHub Container Registry, and
2. **deploys to a Hetzner server over SSH** — it pulls the repo on the server, writes
   `.env` from repository secrets, rebuilds the image and restarts `docker compose`.
   The `knowledgebook-data` volume (SQLite database + local uploads) is preserved
   across deployments.

The deploy step is skipped until the SSH secrets are configured. Set these repository
secrets (Settings → Secrets and variables → Actions):

| Secret                                                                                     | Purpose                                                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `SSH_HOST`, `SSH_USER`, `SSH_PORT`, `SSH_KEY`                                              | SSH access to the Hetzner server (private key)                                                            |
| `DEPLOY_DIR`                                                                               | Checkout directory on the server (default `/opt/knowledgebook`)                                           |
| `APP_URL`                                                                                  | Public origin of the app (default `https://knowledgebook.plutolabs.app`), used for the OAuth callback URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                 | Google OAuth credentials                                                                                  |
| `SESSION_PASSWORD`                                                                         | Cookie encryption key (32+ random chars)                                                                  |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | Hetzner Object Storage                                                                                    |

The server needs `git` and Docker with the compose plugin installed. You can also
trigger a deploy manually from the Actions tab (`workflow_dispatch`).

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
