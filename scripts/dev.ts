/**
 * Local development: the API on :3001 (the same handler Vercel runs) and Vite on :5173,
 * which proxies `/api` to it. Reads `.env.local` then `.env`.
 *
 * Without NEON_AUTH_URL, pass `--dev-user` (or set KHATWA_DEV_USER=1) to skip accounts
 * and use one local user.
 *
 * `--demo` (npm run dev:demo) runs on a separate local database of sample data instead:
 * created and filled on the first run, kept after that, and never Neon. Delete
 * .data/pglite-demo to start it afresh.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createServer as createVite } from 'vite'

const root = resolve(import.meta.dirname, '..')
for (const file of ['.env.local', '.env']) {
  if (existsSync(resolve(root, file))) process.loadEnvFile(resolve(root, file))
}

if (process.argv.includes('--dev-user')) process.env.KHATWA_DEV_USER = '1'

const demo = process.argv.includes('--demo')
const dbDir = demo ? '.data/pglite-demo' : '.data/pglite'
if (demo) {
  // The demo is always the local sample database with the one local user.
  process.env.KHATWA_DEV_USER = '1'
  delete process.env.DATABASE_URL
  delete process.env.DATABASE_URL_UNPOOLED
  delete process.env.NEON_AUTH_URL
  if (!existsSync(resolve(root, dbDir))) {
    console.log('DEMO creating the sample database (first run only)')
    const seeded = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/seedDemo.ts'), '--demo'], { cwd: root, stdio: 'inherit' })
    if (seeded.status !== 0) {
      rmSync(resolve(root, dbDir), { recursive: true, force: true })
      process.exit(seeded.status ?? 1)
    }
  }
}

const { handle } = await import('../src/server/http/handler')

// No Neon connection string: keep the data in a local Postgres (PGlite) under .data/.
// One shared session, so it suits one person clicking around, not load.
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  const { PGlite } = await import('@electric-sql/pglite')
  const { setDriverFactory } = await import('../src/server/http/database')
  mkdirSync(resolve(root, '.data'), { recursive: true })
  const pg = new PGlite(resolve(root, dbDir), { parsers: { 20: Number, 1700: Number } })
  setDriverFactory(async () => ({
    query: async (text, params) => {
      const r = await pg.query<Record<string, unknown>>(text, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
    exec: async (text) => void (await pg.exec(text)),
    close: async () => undefined
  }))
  console.log(demo ? `DB   demo sample data in ${dbDir}` : 'DB   local PGlite in .data/pglite (set DATABASE_URL to use Neon)')
}

const API_PORT = Number(process.env.API_PORT ?? 3001)
createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    console.error('[api]', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
}).listen(API_PORT, () => console.log(`API  http://localhost:${API_PORT}`))

const vite = await createVite({ configFile: resolve(root, 'vite.config.ts') })
await vite.listen()
vite.printUrls()
