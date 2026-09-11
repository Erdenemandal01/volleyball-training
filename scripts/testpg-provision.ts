/**
 * Тусгаарласан локал PostgreSQL 17 cluster дээр production-ыг дуурайсан
 * шинэ өгөгдлийн сан бэлтгэнэ.
 *
 *   npx tsx scripts/testpg-provision.ts <db_нэр> [--with-lockdown]
 *
 * Хийх зүйл:
 *   1. Дүрүүдийг үүсгэнэ (anon/authenticated/service_role/app_pg/platform_admin)
 *   2. Өгөгдлийн сан + системийн schema-нуудыг үүсгэнэ
 *   3. 0000, 0001 migration-ыг APP_ROLE-оор ажиллуулна (хүснэгтийн эзэн нь APP_ROLE)
 *   4. Supabase-ийн анхдагч GRANT-уудыг тавина
 *   5. --with-lockdown өгвөл 0002-ыг ч ажиллуулна
 *
 * Production-д ХЭЗЭЭ Ч хүрэхгүй — зөвхөн 127.0.0.1 дээрх тестийн cluster.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'
import {
  APP_ROLE,
  adminUrl,
  applySupabaseGrants,
  createDatabase,
  ensureRoles,
} from './lib/pg-fixture'

function splitStatements(sqlText: string): string[] {
  return sqlText
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !s.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('--')))
}

export async function applyMigrationFile(database: string, tag: string, asRole = APP_ROLE) {
  const file = path.join(process.cwd(), 'drizzle', `${tag}.sql`)
  const statements = splitStatements(fs.readFileSync(file, 'utf8'))
  const client = new Client({ connectionString: adminUrl(database) })
  await client.connect()
  try {
    await client.query(`set role ${asRole}`)
    for (const statement of statements) await client.query(statement)
    await client.query('reset role')
  } finally {
    await client.end()
  }
  return statements.length
}

export async function provision(name: string, withLockdown = false) {
  await ensureRoles()
  await createDatabase(name)
  const n0 = await applyMigrationFile(name, '0000_init')
  const n1 = await applyMigrationFile(name, '0001_constraints')
  await applySupabaseGrants(name)
  let n2 = 0
  if (withLockdown) n2 = await applyMigrationFile(name, '0002_lockdown_public_grants')
  return { n0, n1, n2 }
}

if (process.argv[1]?.endsWith('testpg-provision.ts')) {
  const name = process.argv[2]
  if (!name) {
    console.error('Хэрэглээ: npx tsx scripts/testpg-provision.ts <db_нэр> [--with-lockdown]')
    process.exit(1)
  }
  const withLockdown = process.argv.includes('--with-lockdown')
  provision(name, withLockdown)
    .then(({ n0, n1, n2 }) => {
      console.log(`  ✓ ${name} бэлэн (0000: ${n0}, 0001: ${n1}, 0002: ${n2} statement)`)
      process.exit(0)
    })
    .catch((error) => {
      console.error('  ✗ Амжилтгүй:', error.message)
      process.exit(1)
    })
}
