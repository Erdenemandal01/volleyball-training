import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import * as schema from './schema'

/**
 * Аль ч драйвер дээр ижил query API ажиллана.
 *  - postgres://  → node-postgres (Supabase болон бусад PostgreSQL)
 *  - pglite://    → WASM PostgreSQL (локал тест, сервер суулгахгүйгээр)
 *
 * Холболт ЗӨВХӨН серверт үүснэ. Энэ файлыг client component-оос импортлохгүй.
 */
export type Db = NodePgDatabase<typeof schema>

export type DbKind = 'postgres' | 'pglite'

export function resolveDbUrl(url?: string): string {
  const value = url ?? process.env.DATABASE_URL
  if (!value) {
    throw new Error(
      'DATABASE_URL тохируулаагүй байна. .env.example файлаас хуулж .env үүсгэнэ үү.',
    )
  }
  return value
}

export function dbKind(url: string): DbKind {
  return url.startsWith('pglite:') ? 'pglite' : 'postgres'
}

function pgliteDataDir(url: string): string {
  const raw = url.replace(/^pglite:\/\//, '').replace(/^pglite:/, '')
  if (!raw || raw === 'memory' || raw === ':memory:') return 'memory://'
  return raw
}

/**
 * Supabase (болон ихэнх managed PostgreSQL) SSL шаарддаг.
 * DATABASE_SSL=disable гэвэл унтраана; үгүй бол sslmode/host-оос автоматаар тодорхойлно.
 */
export function sslConfig(url: string): pg.ConnectionConfig['ssl'] {
  const mode = process.env.DATABASE_SSL?.toLowerCase()
  if (mode === 'disable' || mode === 'false') return undefined
  if (mode === 'require' || mode === 'true') return { rejectUnauthorized: false }

  const lower = url.toLowerCase()
  if (lower.includes('sslmode=disable')) return undefined
  if (
    lower.includes('sslmode=require') ||
    lower.includes('sslmode=verify') ||
    lower.includes('supabase.co') ||
    lower.includes('supabase.com') ||
    lower.includes('neon.tech')
  ) {
    return { rejectUnauthorized: false }
  }
  return undefined
}

/** Supabase-ийн transaction pooler (порт 6543) prepared statement дэмждэггүй. */
export function isTransactionPooler(url: string): boolean {
  return url.includes(':6543') || url.includes('pgbouncer=true')
}

export function createPool(url?: string): pg.Pool {
  const resolved = resolveDbUrl(url)
  return new pg.Pool({
    connectionString: resolved,
    ssl: sslConfig(resolved),
    // Pooler-той ажиллахад холболтыг бага байлгана (serverless-д чухал)
    max: Number(process.env.DATABASE_POOL_MAX ?? (isTransactionPooler(resolved) ? 5 : 10)),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    application_name: 'volleyball-training',
  })
}

export function createDb(url?: string): Db {
  const resolved = resolveDbUrl(url)

  if (dbKind(resolved) === 'pglite') {
    const client = new PGlite(pgliteDataDir(resolved))
    return drizzlePglite(client, { schema }) as unknown as Db
  }

  return drizzlePg(createPool(resolved), { schema })
}
