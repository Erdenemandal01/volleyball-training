/**
 * Хөгжүүлэлтийн орчны өгөгдлийн санг бүрэн цэвэрлэнэ. АНХААРУУЛГА: бүх өгөгдөл устана.
 *   npm run db:reset -- --yes
 */
import './env'
import fs from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { createDb, dbKind, resolveDbUrl } from '../src/db/client'
import { assertSafeTarget } from './guard'

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('  ✗ Баталгаажуулалт шаардлагатай:  npm run db:reset -- --yes')
    process.exit(1)
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('  ✗ Production орчинд ажиллуулахыг хориглосон.')
    process.exit(1)
  }

  const url = resolveDbUrl()
  assertSafeTarget(url, 'db:reset')

  if (dbKind(url) === 'pglite') {
    const dir = url.replace(/^pglite:\/\//, '').replace(/^pglite:/, '')
    if (dir && dir !== 'memory') {
      fs.rmSync(path.resolve(process.cwd(), dir), { recursive: true, force: true })
      console.log(`  ✓ ${dir} устгагдлаа.`)
    }
    process.exit(0)
  }

  const db = createDb(url)
  await db.execute(sql`drop schema public cascade`)
  await db.execute(sql`create schema public`)
  console.log('  ✓ public schema дахин үүслээ. Одоо: npm run db:migrate')
  process.exit(0)
}

main().catch((error) => {
  console.error('  ✗ Амжилтгүй:', error)
  process.exit(1)
})
