/**
 * Буцаах (rollback) SQL нь migration-ы ӨМНӨХ БОДИТ төлөвийг сэргээж байгааг
 * шалгана. Ерөнхий `GRANT ALL` биш, яг тэр эрхүүд сэргэх ёстой.
 *
 * Тусгаарласан in-memory PostgreSQL (PGlite). Production санд хүрэхгүй.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { setupDb } from './helpers'
import {
  buildRestoreSql,
  collectGrants,
  TARGET_GRANTEES,
  type GrantsSnapshot,
} from '../scripts/lib/grants-snapshot'

const MIGRATION = path.join(process.cwd(), 'drizzle', '0002_lockdown_public_grants.sql')
const APP_OWNER = 'app_owner'
const LOCKED = ['anon', 'authenticated'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (result: any): any[] => result.rows ?? result
const raw = (statement: string) => db.execute(sql.raw(statement))

function isCommentOnly(chunk: string): boolean {
  return chunk.split('\n').every((l) => l.trim() === '' || l.trim().startsWith('--'))
}

async function applySqlFile(text: string) {
  const statements = text
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isCommentOnly(s))
  for (const statement of statements) await raw(statement)
}

/** Буцаах SQL-ийг мөр мөрөөр ажиллуулна (breakpoint тэмдэггүй тул `;`-ээр). */
async function applyRestoreSql(text: string) {
  const statements = text
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const statement of statements) await raw(statement)
}

/** Зөвхөн хамрах grantee-үүдийн эрхийг харьцуулах боломжтой хэлбэрт оруулна. */
function fingerprint(snapshot: GrantsSnapshot): string[] {
  const wanted = new Set<string>(TARGET_GRANTEES)
  const grants = snapshot.grants
    .filter((g) => wanted.has(g.grantee))
    .map(
      (g) =>
        `G|${g.kind}|${g.object}${g.column ? `.${g.column}` : ''}|${g.grantee}|${g.privilege}|${g.grantable}`,
    )
  const defaults = snapshot.defaultAcls
    .filter((d) => d.schema === 'public' && wanted.has(d.grantee))
    .map((d) => `D|${d.owner}|${d.objtype}|${d.grantee}|${d.privilege}`)
  return [...grants, ...defaults].sort()
}

let before: GrantsSnapshot
let restoreSql: string

describe('Эрхийн буцаалт (rollback)', () => {
  beforeAll(async () => {
    await setupDb()
    await raw('reset role')

    for (const role of [...LOCKED, 'service_role', APP_OWNER]) {
      await raw(`do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${role}') then
          create role ${role} nologin nosuperuser;
        end if;
      end $$;`)
    }
    await raw(`grant usage, create on schema public to ${APP_OWNER}`)
    await raw(`alter schema public owner to ${APP_OWNER}`)

    const tables = rows(
      await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`),
    ).map((r) => String(r.tablename))
    for (const t of tables) await raw(`alter table public."${t}" owner to ${APP_OWNER}`)

    // Supabase-ийн анхны байдал + нэг тусгай (баганы, GRANT OPTION-той) тохиолдол
    for (const role of [...LOCKED, 'service_role']) {
      await raw(`grant usage on schema public to ${role}`)
      await raw(`grant all privileges on all tables in schema public to ${role}`)
      await raw(
        `alter default privileges for role ${APP_OWNER} in schema public grant all on tables to ${role}`,
      )
    }
    await raw(`grant select (phone) on public.users to anon`)
  })

  it('Snapshot нь хамрах grantee-үүдийн эрхийг бүрэн уншина', async () => {
    before = await collectGrants(db, '1970-01-01T00:00:00.000Z')
    const fp = fingerprint(before)
    expect(fp.length).toBeGreaterThan(50)
    expect(fp.some((x) => x.includes('|anon|SELECT'))).toBe(true)
    expect(fp.some((x) => x.startsWith('D|'))).toBe(true)

    restoreSql = buildRestoreSql(before, TARGET_GRANTEES)
    expect(restoreSql).toContain('GRANT')

    // Ерөнхий бүхэлд нь нээх хэлбэр ашиглаж болохгүй (коммент бус мөрүүд)
    const executable = restoreSql
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('--'))
      .join('\n')
    expect(executable).not.toMatch(/GRANT\s+ALL\b/i)
    expect(executable).not.toMatch(/ON\s+ALL\s+(TABLES|SEQUENCES|FUNCTIONS)/i)
    expect(executable).not.toMatch(/GRANT\s+ALL\s+PRIVILEGES/i)
  })

  it('Migration-ы дараа anon хаагдаж, дараа нь буцаалт төлөвийг СЭРГЭЭНЭ', async () => {
    await raw(`set role ${APP_OWNER}`)
    await applySqlFile(fs.readFileSync(MIGRATION, 'utf8'))
    await raw('reset role')

    // Хаагдсан эсэх
    const locked = rows(
      await db.execute(sql`select has_table_privilege('anon','public.students','SELECT') as x`),
    )[0].x
    expect(locked).toBe(false)

    // Буцаалт
    await raw(`set role ${APP_OWNER}`)
    await applyRestoreSql(restoreSql)
    await raw('reset role')

    const after = await collectGrants(db, '1970-01-01T00:00:00.000Z')
    expect(fingerprint(after)).toEqual(fingerprint(before))
  })

  /**
   * Жинхэнэ PostgreSQL 17 дээр илэрсэн гурван согогийн регресс хамгаалалт.
   * PGlite дээр эдгээр анх мэдэгдээгүй тул тусад нь бататгана.
   */
  it('Буцаалт: баганын түвшний GRANT сэргээгдэнэ', async () => {
    // Хүснэгтийн түвшний REVOKE баганын GRANT-ыг ч авдаг тул буцаалтад заавал орно
    expect(restoreSql).toMatch(/GRANT\s+SELECT\s*\("phone"\)\s+ON\s+TABLE\s+public\."users"/i)
    const attacl = rows(
      await db.execute(sql`
        select a.attacl::text as acl
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'users' and a.attname = 'phone'
      `),
    )[0]
    expect(String(attacl.acl ?? '')).toContain('anon')
  })

  it('Буцаалт: schema-ийн GRANT сэргээгдэнэ (эзэн нь өөр дүр байсан ч)', async () => {
    expect(restoreSql).toMatch(/GRANT\s+USAGE\s+ON\s+SCHEMA\s+public\s+TO\s+"anon"/i)
    const usage = rows(
      await db.execute(sql`select has_schema_privilege('anon','public','USAGE') as x`),
    )[0].x
    expect(usage).toBe(true)
  })

  it('Буцаалт: ажиллуулагч өөрчилж ЧАДАХГҮЙ эрхийг гүйцэтгэх мөр болгон бичихгүй', async () => {
    // `ALTER DEFAULT PRIVILEGES FOR ROLE <гишүүн биш дүр>` нь бүх буцаалтыг
    // "permission denied to change default privileges" гэж зогсоодог.
    const executable = restoreSql
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('--'))
    const actAs = new Set(before.actAsRoles)
    for (const line of executable) {
      const m = /ALTER DEFAULT PRIVILEGES FOR ROLE "([^"]+)"/i.exec(line)
      if (m) expect(actAs.has(m[1])).toBe(true)
    }
    expect(executable.some((l) => /ALTER DEFAULT PRIVILEGES/i.test(l))).toBe(true)
  })

  it('Буцаалт нь хамрахгүй grantee-г (service_role) өөрчлөхгүй', async () => {
    // service_role-д migration ч, буцаалт ч хүрэхгүй — эрх нь тогтмол хэвээр
    const priv = rows(
      await db.execute(sql`
        select has_table_privilege('service_role','public.students','SELECT') as s,
               has_table_privilege('service_role','public.payments','INSERT') as i
      `),
    )[0]
    expect(priv.s).toBe(true)
    expect(priv.i).toBe(true)
    expect(restoreSql).not.toContain('service_role')
  })
})
