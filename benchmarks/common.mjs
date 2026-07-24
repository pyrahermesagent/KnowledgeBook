import { mkdir, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const testDir = join(rootDir, '.data', 'benchmark-test')

export async function setupBenchmarkDb() {
  try {
    await rm(testDir, { recursive: true, force: true })
  } catch {}
  await mkdir(testDir, { recursive: true })
}

export async function teardownBenchmarkDb() {
  try {
    await rm(testDir, { recursive: true, force: true })
  } catch {}
}

export function getTestDbPath() {
  return join(testDir, 'benchmark-test.db')
}
