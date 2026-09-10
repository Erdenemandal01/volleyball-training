import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { createPool, dbKind, resolveDbUrl } from './client'
import * as schema from './schema'

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')

/** Migration-уудыг тухайн холболт дээр ажиллуулна (дахин ажиллуулахад аюулгүй). */
export async function runMigrations(url?: string) {
  const resolved = resolveDbUrl(url)

  if (dbKind(resolved) === 'pglite') {
    const dir = resolved.replace(/^pglite:\/\//, '').replace(/^pglite:/, '')
    const client = new PGlite(!dir || dir === 'memory' ? 'memory://' : dir)
    const db = drizzlePglite(client, { schema })
    await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
    await client.close()
    return
  }

  const pool = createPool(resolved)
  try {
    const db = drizzlePg(pool, { schema })
    await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await pool.end()
  }
}
