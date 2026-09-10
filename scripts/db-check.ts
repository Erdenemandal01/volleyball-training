/**
 * Өгөгдлийн сангийн холболтыг шалгана (өгөгдөл өөрчлөхгүй, зөвхөн уншина).
 *
 *   npm run db:check              # DATABASE_URL (апп-ын холболт)
 *   npm run db:check -- --direct  # DIRECT_DATABASE_URL (migration-ы холболт)
 */
import './env'
import { sql } from 'drizzle-orm'
import { createDb, dbKind } from '../src/db/client'

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
}

async function main() {
  const useDirect = process.argv.includes('--direct')
  const label = useDirect ? 'DIRECT_DATABASE_URL' : 'DATABASE_URL'
  const url = useDirect ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL

  if (!url) {
    console.error(`\n  ✗ ${label} тохируулаагүй байна.\n`)
    process.exit(1)
  }

  if (url.includes('[YOUR-PASSWORD]')) {
    console.error(`\n  ✗ ${label} дотор [YOUR-PASSWORD] орлуулагдаагүй байна.`)
    console.error('    Ажиллуулна уу:  npm run db:set-password\n')
    process.exit(1)
  }

  console.log(`\n  ${label}: ${maskUrl(url)}`)
  console.log(`  Драйвер: ${dbKind(url) === 'pglite' ? 'PGlite (локал)' : 'PostgreSQL'}\n`)

  const db = createDb(url)
  const started = process.hrtime.bigint()

  try {
    const info = await db.execute(
      sql`select current_database() as db, current_user as usr, version() as version`,
    )
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6
    const row = (info.rows ?? info)[0] as Record<string, string>

    console.log('  ✓ Холболт амжилттай')
    console.log(`    Хугацаа : ${elapsed.toFixed(0)} ms`)
    console.log(`    Database: ${row.db}`)
    console.log(`    User    : ${row.usr}`)
    console.log(`    Version : ${String(row.version).split(' ').slice(0, 2).join(' ')}`)

    const tables = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name
    `)
    const names = ((tables.rows ?? tables) as Array<{ table_name: string }>).map(
      (t) => t.table_name,
    )

    if (names.length === 0) {
      console.log('\n  • public schema хоосон байна — migration хараахан ажиллаагүй.')
      console.log('    Дараагийн алхам:  npm run db:migrate')
    } else {
      console.log(`\n  • public schema дахь хүснэгт (${names.length}):`)
      console.log(`    ${names.join(', ')}`)

      // Мөрийн тоог зөвхөн уншиж харуулна
      const counted: string[] = []
      for (const table of ['users', 'students', 'payments', 'attendance']) {
        if (!names.includes(table)) continue
        const result = await db.execute(
          sql.raw(`select count(*)::int as n from "${table}"`),
        )
        const value = ((result.rows ?? result) as Array<{ n: number }>)[0]?.n ?? 0
        counted.push(`${table}=${value}`)
      }
      if (counted.length) console.log(`  • Мөрийн тоо: ${counted.join(', ')}`)
    }

    console.log('')
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('\n  ✗ Холболт амжилтгүй боллоо')
    console.error(`    ${message}\n`)

    if (/password authentication failed|SASL|SCRAM/i.test(message)) {
      console.error('    → Нууц үг буруу эсвэл URL-encode хийгдээгүй байж болно.')
      console.error('      npm run db:set-password  командаар дахин оруулна уу.')
    } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      console.error('    → Host нэр буруу эсвэл интернэт холболт байхгүй байна.')
    } else if (/ETIMEDOUT|ECONNREFUSED/i.test(message)) {
      console.error('    → Порт хаагдсан эсвэл сүлжээний хязгаарлалт байж магадгүй.')
      console.error('      Supabase төсөл идэвхтэй (paused биш) эсэхийг шалгана уу.')
    } else if (/self.signed|certificate/i.test(message)) {
      console.error('    → SSL асуудал. DATABASE_SSL="require" гэж тохируулж үзнэ үү.')
    }
    console.error('')
    process.exit(1)
  }
}

main()
