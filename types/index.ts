export * from './theme';

/**
 * A row of the `pages` table.
 *
 * The encryption columns are nullable: they are only populated once a page has
 * been encrypted via the page encryption service.
 */
export interface Page {
  id: number;
  project_id: number;
  section_id: number | null;
  slug: string;
  title: string;
  content: string;
  position: number;
  updated_at: string;
  encrypted_content?: string | null;
  encryption_iv?: string | null;
  encryption_key_id?: string | null;
  content_hash?: string | null;
  is_encrypted?: boolean;
}
