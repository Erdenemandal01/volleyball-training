/**
 * public schema дахь эрхийн одоогийн төлөвийг хадгалж, БУЦААХ SQL үүсгэнэ.
 * ЗӨВХӨН УНШИНА — өгөгдлийн санд юу ч өөрчлөхгүй.
 *
 *   npm run db:snapshot              # DATABASE_URL
 *   npm run db:snapshot -- --direct  # DIRECT_DATABASE_URL
 *   npm run db:snapshot -- --out=drizzle/rollback
 *
 * Гаралт (хоёр файл):
 *   <out>/<timestamp>_grants_snapshot.json  — бүрэн төлөв (баримт болгон)
 *   <out>/<timestamp>_grants_restore.sql    — яг тэр төлөвийг сэргээх SQL
 *
 * Үүсгэсэн SQL-ийг ЭНЭ команд ажиллуулахгүй. Санаатайгаар, гараар ажиллуулна.
 */
import './env'
import fs from 'node:fs'
import path from 'node:path'
import { createDb } from '../src/db/client'
import { buildRestoreSql, collectGrants, TARGET_GRANTEES } from './lib/grants-snapshot'

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
}

async function main() {
  const useDirect = process.argv.includes('--direct')
  const url = (useDirect ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL) ?? ''
  if (!url || url.includes('[YOUR-PASSWORD]')) {
    console.error('\n  ✗ Холболтын мөр тохируулаагүй байна.\n')
    process.exit(1)
  }

  const outDir = path.resolve(process.cwd(), arg('out', 'drizzle/rollback'))
  fs.mkdirSync(outDir, { recursive: true })

  const db = createDb(url)
  const takenAt = new Date().toISOString()
  console.log(`\n  Уншиж байна: ${maskUrl(url)}`)

  const snapshot = await collectGrants(db, takenAt)
  const stamp = takenAt.replace(/[:.]/g, '-')

  const jsonPath = path.join(outDir, `${stamp}_grants_snapshot.json`)
  const sqlPath = path.join(outDir, `${stamp}_grants_restore.sql`)

  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2))
  fs.writeFileSync(sqlPath, buildRestoreSql(snapshot, TARGET_GRANTEES))

  const targeted = snapshot.grants.filter((g) =>
    (TARGET_GRANTEES as readonly string[]).includes(g.grantee),
  )
  const targetedDefaults = snapshot.defaultAcls.filter(
    (d) => d.schema === 'public' && (TARGET_GRANTEES as readonly string[]).includes(d.grantee),
  )

  console.log(`\n  Нийт эрхийн бичлэг       : ${snapshot.grants.length}`)
  console.log(`  Үүнээс буцаалтад хамаарах: ${targeted.length}`)
  console.log(`  public-ийн default ACL    : ${targetedDefaults.length}`)
  console.log(`\n  ✓ ${path.relative(process.cwd(), jsonPath)}`)
  console.log(`  ✓ ${path.relative(process.cwd(), sqlPath)}`)
  console.log('\n  ЖИЧ: буцаах SQL-ийг энэ команд ажиллуулаагүй.\n')
  process.exit(0)
}

main().catch((error) => {
  console.error('\n  ✗ Амжилтгүй:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
