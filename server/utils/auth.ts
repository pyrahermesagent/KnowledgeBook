import type { H3Event } from 'h3';

export interface SessionUser {
  id: number;
  /** Null for accounts that have only ever signed in with a wallet. */
  email: string | null;
  name: string;
  avatar: string;
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const session = await requireUserSession(event);
  return session.user as SessionUser;
}

export interface ProjectRow {
  id: number;
  owner_id: number;
  slug: string;
  name: string;
  description: string;
  accent_color: string;
  icon_url: string;
  font_family: string;
  bg_color: string;
  bg_subtle: string;
  text_color: string;
  'text-muted': string;
  border_color: string;
  radius: number;
  created_at: string;
  updated_at: string;
}

export function getProjectBySlug(slug: string): ProjectRow | undefined {
  return useDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as
    ProjectRow | undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True when the account is a member of the project.
 *
 * A member row is either an email invite or a wallet invite, so an invitation
 * can be issued before that person has ever signed in. Email rows match the
 * account's email; wallet rows match any identity linked to the account. The
 * admin/owner is not stored as a member.
 *
 * A null email never matches: `identifier = NULL` is NULL, not true.
 */
export function isProjectMember(projectId: number, userId: number, email: string | null): boolean {
  return Boolean(
    useDb()
      .prepare(
        `SELECT 1 FROM project_members m
         WHERE m.project_id = @projectId
           AND ( (m.kind = 'email' AND m.identifier = @email)
                 OR EXISTS (SELECT 1 FROM user_identities i
                            WHERE i.user_id = @userId
                              AND i.provider = m.kind
                              AND i.subject = m.identifier) )
         LIMIT 1`
      )
      .get({
        projectId,
        userId,
        email: email ? normalizeEmail(email) : null,
      })
  );
}

/**
 * Loads the project from the `slug` route param and asserts the session user
 * can work on it — either as the admin (owner) or as an invited member.
 */
export async function requireProjectAccess(
  event: H3Event
): Promise<{ user: SessionUser; project: ProjectRow; isAdmin: boolean }> {
  const user = await requireUser(event);
  const slug = getRouterParam(event, 'slug')!;
  const project = getProjectBySlug(slug);
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' });
  const isAdmin = project.owner_id === user.id;
  if (!isAdmin && !isProjectMember(project.id, user.id, user.email)) {
    throw createError({ statusCode: 403, message: 'You are not a member of this project' });
  }
  return { user, project, isAdmin };
}

/** Like requireProjectAccess, but only the project admin (owner) passes. */
export async function requireProjectAdmin(
  event: H3Event
): Promise<{ user: SessionUser; project: ProjectRow }> {
  const { user, project, isAdmin } = await requireProjectAccess(event);
  if (!isAdmin)
    throw createError({ statusCode: 403, message: 'Only the project admin can do this' });
  return { user, project };
}

export const RESERVED_SLUGS = new Set([
  'api',
  'dashboard',
  'login',
  'logout',
  'uploads',
  'assets',
  'admin',
  'settings',
  'about',
  'help',
  'new',
  '_nuxt',
  'favicon.ico',
  'robots.txt',
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
