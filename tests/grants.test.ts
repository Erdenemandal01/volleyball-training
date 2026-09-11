/**
 * 0002_lockdown_public_grants.sql-ийн үйлчлэлийг ТУСГААРЛАСАН орчинд шалгана.
 *
 * ЧУХАЛ: бүх баталгааг superuser БИШ дүр (`app_owner`) дээр гүйцэтгэнэ.
 * Superuser дээр `has_table_privilege` нь ACL-аас үл хамааран үргэлж TRUE
 * буцаадаг тул тест хуурамчаар давах байсан.
 *
 * Production санд огт хүрэхгүй — in-memory PostgreSQL (PGlite).
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { setupDb } from './helpers'

const MIGRATION = path.join(process.cwd(), 'drizzle', '0002_lockdown_public_grants.sql')
const LOCKED = ['anon', 'authenticated'] as const
const APP_OWNER = 'app_owner'
const OTHER_OWNER = 'platform_admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (result: any): any[] => result.rows ?? result
const raw = (statement: string) => db.execute(sql.raw(statement))

let appTables: string[] = []

async function tablePrivilege(role: string, table: string, priv: string): Promise<boolean> {
  const r = rows(
    await db.execute(
      sql`select has_table_privilege(${role}, ${'public.' + table}, ${priv}) as ok`,
    ),
  )
  return r[0].ok === true
}

/** Тухайн дүрд public schema дээр ШУУД олгосон эрх (PUBLIC-аар дамжсаныг тооцохгүй). */
async function hasDirectSchemaGrant(role: string): Promise<boolean> {
  const r = rows(
    await db.execute(sql`
      select coalesce(array_to_string(nspacl, ','), '') as acl
      from pg_namespace where nspname = 'public'
    `),
  )
  return String(r[0].acl).includes(`${role}=`)
}

async function columnGrantCount(role: string): Promise<number> {
  const r = rows(
    await db.execute(sql`
      select count(*)::int as n from information_schema.column_privileges
      where table_schema = 'public' and grantee = ${role}
    `),
  )
  return Number(r[0].n)
}

function isCommentOnly(chunk: string): boolean {
  return chunk.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('--'))
}

/** Migration файлыг statement тус бүрээр ажиллуулна. */
async function applyLockdownMigration() {
  const statements = fs
    .readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isCommentOnly(s))
  for (const statement of statements) {
    await raw(statement)
  }
}

describe('public schema-ийн эрхийн хаалт (0002)', () => {
  beforeAll(async () => {
    await setupDb()
    await raw('reset role')

    // Аппын хүснэгтүүдийн жагсаалтыг схемээс уншина (гараар бичихгүй)
    appTables = rows(
      await db.execute(sql`
        select tablename from pg_tables where schemaname = 'public' order by tablename
      `),
    ).map((r) => String(r.tablename))
    expect(appTables.length).toBeGreaterThanOrEqual(18)

    // 1. Supabase-ийн дүрүүд + superuser БИШ аппын эзэмшигч
    for (const role of [...LOCKED, 'service_role', APP_OWNER, OTHER_OWNER]) {
      await raw(`do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${role}') then
          create role ${role} nologin nosuperuser;
        end if;
      end $$;`)
    }
    await raw(`grant usage, create on schema public to ${APP_OWNER}, ${OTHER_OWNER}`)

    // Production-той тааруулна: тэнд `public` schema-г `pg_database_owner` эзэмшдэг
    // бөгөөд аппын `postgres` дүр түүний гишүүн (хэмжиж баталсан) — өөрөөр хэлбэл
    // schema дээрх REVOKE-ийг гүйцэтгэх эрхтэй. REVOKE нь зөвхөн grantor нь
    // тухайн дүртэй таарсан ACL мөрийг хасдаг тул энэ нь чухал.
    await raw(`alter schema public owner to ${APP_OWNER}`)

    // 2. Бүх хүснэгтийг superuser биш эзэмшигч рүү шилжүүлнэ
    for (const table of appTables) {
      await raw(`alter table public."${table}" owner to ${APP_OWNER}`)
    }

    // 3. Supabase-ийн анхны байдлыг дуурайна
    for (const role of [...LOCKED, 'service_role']) {
      await raw(`grant usage on schema public to ${role}`)
      await raw(`grant all privileges on all tables in schema public to ${role}`)
      await raw(
        `alter default privileges for role ${APP_OWNER} in schema public grant all on tables to ${role}`,
      )
    }
    // Баганы түвшний GRANT — хураагдаж байгаа эсэхийг шалгана
    await raw(`grant select (phone) on public.users to anon`)

    // 4. Өөр эзэнтэй обьект — migration үүнээс болж унахгүй байх ёстой
    await raw(`set role ${OTHER_OWNER}`)
    await raw(`create table public.platform_owned (id int primary key)`)
    await raw(
      `alter default privileges for role ${OTHER_OWNER} in schema public grant all on tables to anon`,
    )
    await raw('reset role')
  })

  it('Эхлэх байдал: Supabase-ийн анхны эрхүүд байрлаж байна', async () => {
    for (const role of LOCKED) {
      expect(await hasDirectSchemaGrant(role)).toBe(true)
      expect(await tablePrivilege(role, 'students', 'SELECT')).toBe(true)
      expect(await tablePrivilege(role, 'payments', 'UPDATE')).toBe(true)
      expect(await tablePrivilege(role, 'users', 'DELETE')).toBe(true)
    }
    expect(await columnGrantCount('anon')).toBeGreaterThan(0)
  })

  it('Migration нь superuser бус эзэмшигчээр, өөр эзэнтэй обьект байсан ч амжилттай ажиллана', async () => {
    await raw(`set role ${APP_OWNER}`)
    await expect(applyLockdownMigration()).resolves.toBeUndefined()
    await raw('reset role')

    // Өөр эзэнтэй хүснэгт хэвээрээ, хөндөгдөөгүй
    const owner = rows(
      await db.execute(sql`
        select pg_get_userbyid(relowner) as owner from pg_class where oid = 'public.platform_owned'::regclass
      `),
    )[0].owner
    expect(owner).toBe(OTHER_OWNER)
  })

  it('anon / authenticated нь аппын аль ч хүснэгтэд хандаж чадахгүй', async () => {
    for (const role of LOCKED) {
      for (const table of appTables) {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES']) {
          expect(
            await tablePrivilege(role, table, priv),
            `${role} нь ${table} дээр ${priv} эрхтэй үлдсэн`,
          ).toBe(false)
        }
      }
      expect(await hasDirectSchemaGrant(role), `${role} схемд шууд эрхтэй үлдсэн`).toBe(false)
    }
    expect(await columnGrantCount('anon'), 'баганы түвшний GRANT үлдсэн').toBe(0)
  })

  it('Аппын дүр (superuser бус эзэмшигч) бүрэн ажиллана', async () => {
    await raw(`set role ${APP_OWNER}`)
    try {
      for (const table of appTables) {
        for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          expect(
            await tablePrivilege(APP_OWNER, table, priv),
            `Апп ${table} дээр ${priv} эрхээ алдсан`,
          ).toBe(true)
        }
      }
      // Бодит бичилт/уншилт
      await raw(`insert into training_groups (name) values ('Эрхийн тестийн бүлэг')`)
      const n = rows(await db.execute(sql`select count(*)::int as n from training_groups`))[0].n
      expect(Number(n)).toBeGreaterThan(0)
      // Migration-ы дараа ч шинэ хүснэгт үүсгэж чадна (drizzle цаашид ажиллана)
      await raw('create table public.after_lockdown (id int primary key)')
      await raw('drop table public.after_lockdown')
    } finally {
      await raw('reset role')
    }
  })

  it('service_role-ийн эрхийг САНААТАЙГААР хөндөөгүй', async () => {
    expect(await tablePrivilege('service_role', 'students', 'SELECT')).toBe(true)
    expect(await tablePrivilege('service_role', 'payments', 'INSERT')).toBe(true)
  })

  it('Ирээдүйд аппын эзэмшигчийн үүсгэх хүснэгтэд эрх автоматаар очихгүй', async () => {
    await raw(`set role ${APP_OWNER}`)
    await raw('create table public.future_owned (id int primary key)')
    await raw('reset role')
    try {
      for (const role of LOCKED) {
        expect(await tablePrivilege(role, 'future_owned', 'SELECT')).toBe(false)
      }
    } finally {
      await raw('drop table public.future_owned')
    }
  })

  it('ТАЙЛБАРЛАСАН ЦООРХОЙ: өөр дүрийн default privileges хэвээр үлдэнэ', async () => {
    // supabase_admin-ийн default privileges-т `postgres` хүрэх эрхгүй.
    // Тэр дүр public-д обьект үүсгэвэл anon дахин эрх авна — үүнийг
    // нуухын оронд тестээр баримтжуулж, db:grants --strict-аар хянана.
    await raw(`set role ${OTHER_OWNER}`)
    await raw('create table public.platform_future (id int primary key)')
    await raw('reset role')
    try {
      expect(await tablePrivilege('anon', 'platform_future', 'SELECT')).toBe(true)
    } finally {
      await raw('drop table public.platform_future')
    }
  })

  it('Хамрах хүрээ: database-wide default privileges мөр ҮҮСГЭХГҮЙ', async () => {
    // Schema заагаагүй `ALTER DEFAULT PRIVILEGES` нь pg_default_acl-д
    // defaclnamespace = 0 мөр үүсгэж, тухайн дүрийн БҮХ schema-д нөлөөлдөг.
    // Энэ migration тийм мөр үүсгэхгүй байх ёстой.
    const global = rows(
      await db.execute(sql`
        select pg_get_userbyid(defaclrole) as owner, defaclobjtype::text as objtype,
               array_to_string(defaclacl, ', ') as acl
        from pg_default_acl where defaclnamespace = 0
      `),
    )
    expect(
      global.filter((g) => g.owner === APP_OWNER),
      `Аппын дүр database-wide default privileges үүсгэсэн: ${JSON.stringify(global)}`,
    ).toHaveLength(0)
  })

  it('ТАЙЛБАРЛАСАН ЦООРХОЙ: ирээдүйн функц PUBLIC-д нээлттэй хэвээр', async () => {
    // Далд PUBLIC EXECUTE-ийг урьдчилан хаах нь database-wide өөрчлөлт
    // шаарддаг тул migration-д ЗОРИУД оруулаагүй. Үүнийг нуухын оронд
    // баримтжуулж, db:grants --strict-аар илрүүлнэ.
    await raw(`set role ${APP_OWNER}`)
    await raw('create function public.fn_check() returns int language sql as $$ select 1 $$')
    await raw('reset role')
    try {
      const acl = rows(
        await db.execute(sql`
          select coalesce(array_to_string(proacl, ','), '(default)') as acl
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_check'
        `),
      )[0].acl
      expect(acl).toBe('(default)')
      const r = rows(
        await db.execute(sql`select has_function_privilege('anon','public.fn_check()','EXECUTE') as x`),
      )
      expect(r[0].x).toBe(true)
    } finally {
      await raw('drop function public.fn_check()')
    }
  })

  it('Дүр байхгүй орчинд алдаагүй ажиллана (зан төлөвөөр шалгав)', async () => {
    // anon/authenticated дүрийг түр устгаад migration-ыг дахин ажиллуулна
    await raw('revoke all privileges on all tables in schema public from anon, authenticated')
    await raw('revoke all on schema public from anon, authenticated')
    await raw(`alter default privileges for role ${APP_OWNER} in schema public revoke all on tables from anon, authenticated`)
    await raw(`alter default privileges for role ${OTHER_OWNER} in schema public revoke all on tables from anon`)
    await raw('drop role anon')
    try {
      await raw(`set role ${APP_OWNER}`)
      await expect(applyLockdownMigration()).resolves.toBeUndefined()
      await raw('reset role')
    } finally {
      await raw('create role anon nologin nosuperuser')
    }
  })

  it('Дахин ажиллуулахад идемпотент', async () => {
    await raw(`set role ${APP_OWNER}`)
    await expect(applyLockdownMigration()).resolves.toBeUndefined()
    await raw('reset role')
    expect(await tablePrivilege('anon', 'students', 'SELECT')).toBe(false)
  })
})
