import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useDb, closeDb } from '#utils/db';
import { setRuntimeConfig } from './nuxt-globals';

// Wire the real useDb into the global the server modules call.
(globalThis as Record<string, unknown>).__useDbImpl = useDb;

const tempDirs: string[] = [];

/**
 * Point the app at a fresh on-disk SQLite file and return the initialised
 * connection.
 *
 * A file rather than :memory: because useDb resolves the configured path and
 * creates the parent directory. Each call gets its own database, so tests do
 * not share rows through the module-level connection singleton.
 */
export function createTestDb() {
  closeDb();

  const dir = mkdtempSync(join(tmpdir(), 'kb-test-'));
  tempDirs.push(dir);
  setRuntimeConfig({ databasePath: join(dir, 'test.db') });

  return useDb();
}

/** Close the connection and remove every temp database created so far. */
export function destroyTestDbs(): void {
  closeDb();

  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold the file briefly after close; a leaked temp dir is
      // not worth failing a test over.
    }
  }
}
