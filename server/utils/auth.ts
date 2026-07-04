import type { H3Event } from 'h3'

export interface SessionUser {
  id: number
  email: string
  name: string
  avatar: string
}

export async function requireUser (event: H3Event): Promise<SessionUser> {
  const session = await requireUserSession(event)
  return session.user as SessionUser
}

export interface ProjectRow {
  id: number
  owner_id: number
  slug: string
  name: string
  description: string
  accent_color: string
  icon_url: string
  created_at: string
  updated_at: string
}

export function getProjectBySlug (slug: string): ProjectRow | undefined {
  return useDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined
}

/** Loads the project from the `slug` route param and asserts the session user owns it. */
export async function requireOwnedProject (event: H3Event): Promise<{ user: SessionUser, project: ProjectRow }> {
  const user = await requireUser(event)
  const slug = getRouterParam(event, 'slug')!
  const project = getProjectBySlug(slug)
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })
  if (project.owner_id !== user.id) throw createError({ statusCode: 403, message: 'You do not own this project' })
  return { user, project }
}

export const RESERVED_SLUGS = new Set([
  'api', 'dashboard', 'login', 'logout', 'uploads', 'assets', 'admin',
  'settings', 'about', 'help', 'new', '_nuxt', 'favicon.ico', 'robots.txt'
])

export function slugify (input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
