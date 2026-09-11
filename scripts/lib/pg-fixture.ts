/**
 * Supabase-ийн production топологийг ТУСГААРЛАСАН локал PostgreSQL cluster дээр
 * дуурайж, шинэ өгөгдлийн сан бэлтгэнэ.
 *
 * Бодит Supabase-аас ХЭМЖИЖ авсан баримтууд (scratch/probe-topology.ts):
 *   • database owner          = postgres      (тиймээс pg_database_owner-ийн ДАЛД гишүүн)
 *   • public schema owner     = pg_database_owner
 *   • public nspacl grantor   = pg_database_owner  ← REVOKE-д чухал
 *   • 18 хүснэгтийн эзэмшигч  = postgres
 *   • хүснэгтийн ACL          = {postgres,anon,authenticated,service_role}=arwdDxtm/postgres
 *   • public-ийн default ACL  = postgres (r,S,f) БА supabase_admin (r,S,f)
 *   • postgres нь anon, authenticated, service_role, authenticator-ийн ГИШҮҮН
 *   • postgres.rolbypassrls   = true;  service_role.rolbypassrls = true
 *   • supabase_admin          = superuser
 *   • database-wide default ACL (defaclnamespace = 0) = ХООСОН
 *
 * Энэ файл production-д ХЭЗЭЭ Ч ажиллахгүй — зөвхөн локал cluster руу чиглэнэ.
 */
import { Client } from 'pg'

/** Production-ы `postgres` дүрийг төлөөлөх нэр (superuser БИШ). */
export const APP_ROLE = 'app_pg'
/** PostgREST-ийн дүрүүд. */
export const API_ROLES = ['anon', 'authenticated'] as const
/** Платформын superuser-ийг төлөөлнө. */
export const PLATFORM_ROLE = 'platform_admin'
/** Supabase-ийн системийн schema-г төлөөлөх, платформын эзэмшдэг schema-нууд. */
export const SYSTEM_SCHEMAS = ['auth', 'storage', 'graphql'] as const

const HOST = process.env.TESTPG_HOST ?? '127.0.0.1'
const PORT = Number(process.env.TESTPG_PORT ?? 55432)

export function adminUrl(database = 'postgres'): string {
  return `postgresql://postgres@${HOST}:${PORT}/${database}`
}

export function appUrlFor(database: string): string {
  return `postgresql://${APP_ROLE}@${HOST}:${PORT}/${database}`
}

function assertLocal() {
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    throw new Error(`pg-fixture зөвхөн локал cluster дээр ажиллана (HOST=${HOST})`)
  }
}

async function run(url: string, statements: string[]) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    for (const statement of statements) await client.query(statement)
  } finally {
    await client.end()
  }
}

export async function query<T = Record<string, unknown>>(
  url: string,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query(text, values)
    return result.rows as T[]
  } finally {
    await client.end()
  }
}

/** Cluster-ийн хэмжээнд нэг удаа: дүрүүдийг үүсгэнэ (идемпотент). */
export async function ensureRoles() {
  assertLocal()
  const mk = (name: string, opts: string) => `
    do $fx$ begin
      if not exists (select 1 from pg_roles where rolname = '${name}') then
        create role ${name} ${opts};
      end if;
    end $fx$;`

  await run(adminUrl(), [
    mk(PLATFORM_ROLE, 'superuser login'),
    mk('anon', 'nologin noinherit'),
    mk('authenticated', 'nologin noinherit'),
    mk('service_role', 'nologin noinherit bypassrls'),
    mk('authenticator', 'login noinherit'),
    // Production-ы postgres: superuser БИШ, гэхдээ bypassrls/createrole/createdb
    mk(APP_ROLE, 'login createdb createrole bypassrls'),
    // postgres нь эдгээрийн гишүүн (production-оос хэмжсэн)
    `grant anon, authenticated, service_role, authenticator to ${APP_ROLE}`,
  ])
}

/**
 * Шинэ, бүрэн тусгаарлагдсан өгөгдлийн сан үүсгэж production-ы эрхийн
 * зураглалыг давтана. Аппын хүснэгтүүдийг migration-аар үүсгэсэн байх ёстой
 * тул энэ функц зөвхөн БЭЛТГЭНЭ; хүснэгт үүссэний дараа `applySupabaseGrants`-ыг
 * дуудна.
 */
export async function createDatabase(name: string) {
  assertLocal()
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) throw new Error(`буруу нэр: ${name}`)
  await run(adminUrl(), [
    `drop database if exists ${name} (force)`,
    // Эзэмшигч нь APP_ROLE → тэр ДАЛДААР pg_database_owner-ийн гишүүн болно
    `create database ${name} owner ${APP_ROLE}`,
  ])

  // public schema-г production шиг pg_database_owner-т шилжүүлж, GRANT-уудыг
  // ЯГ ТЭР grantor-оор (pg_database_owner) олгоно.
  await run(adminUrl(name), [
    `alter schema public owner to pg_database_owner`,
    `set role pg_database_owner`,
    `grant usage on schema public to ${APP_ROLE}, anon, authenticated, service_role`,
    `reset role`,
  ])

  // Платформын эзэмшдэг системийн schema-нууд (migration хөндөх ЁСГҮЙ)
  const systemSetup: string[] = []
  for (const schema of SYSTEM_SCHEMAS) {
    systemSetup.push(`create schema ${schema} authorization ${PLATFORM_ROLE}`)
    systemSetup.push(`set role ${PLATFORM_ROLE}`)
    systemSetup.push(`create table ${schema}.platform_tbl (id int primary key, note text)`)
    systemSetup.push(`create function ${schema}.platform_fn() returns int language sql as 'select 1'`)
    systemSetup.push(`create sequence ${schema}.platform_seq`)
    systemSetup.push(`grant usage on schema ${schema} to anon, authenticated, service_role`)
    systemSetup.push(
      `grant select, insert, update, delete on ${schema}.platform_tbl to anon, authenticated, service_role`,
    )
    systemSetup.push(`grant usage, select on sequence ${schema}.platform_seq to anon, authenticated`)
    systemSetup.push(
      `alter default privileges for role ${PLATFORM_ROLE} in schema ${schema} grant all on tables to anon, authenticated`,
    )
    systemSetup.push(`reset role`)
  }
  await run(adminUrl(name), systemSetup)
}

/**
 * Supabase-ийн анхдагч GRANT-уудыг public schema-д тавина.
 * Аппын migration (0000/0001) ажилласны ДАРАА дуудна.
 */
export async function applySupabaseGrants(name: string) {
  assertLocal()
  const statements = [
    // Платформын (өөр эзэнтэй) обьект public дотор — migration алгасах ёстой
    `set role ${PLATFORM_ROLE}`,
    `create table if not exists public.platform_owned (id int primary key)`,
    `grant select, insert on public.platform_owned to anon, authenticated`,
    // supabase_admin-ийн default privileges (APP_ROLE өөрчлөх эрхгүй)
    `alter default privileges for role ${PLATFORM_ROLE} in schema public grant all on tables to anon, authenticated, service_role`,
    `alter default privileges for role ${PLATFORM_ROLE} in schema public grant all on sequences to anon, authenticated, service_role`,
    `alter default privileges for role ${PLATFORM_ROLE} in schema public grant execute on functions to anon, authenticated, service_role`,
    `reset role`,

    // APP_ROLE-ийн эзэмшдэг обьектууд дээрх Supabase-ийн анхдагч эрхүүд
    `set role ${APP_ROLE}`,
    `grant all privileges on all tables in schema public to anon, authenticated, service_role`,
    `grant all privileges on all sequences in schema public to anon, authenticated, service_role`,
    `grant all privileges on all functions in schema public to anon, authenticated, service_role`,
    `alter default privileges for role ${APP_ROLE} in schema public grant all on tables to anon, authenticated, service_role`,
    `alter default privileges for role ${APP_ROLE} in schema public grant all on sequences to anon, authenticated, service_role`,
    `alter default privileges for role ${APP_ROLE} in schema public grant execute on functions to anon, authenticated, service_role`,
    // Баганын түвшний нэмэлт GRANT (хүснэгтийн REVOKE үүнийг ч авах ёстой)
    `grant select (phone) on public.users to anon`,
    `reset role`,
  ]
  await run(adminUrl(name), statements)
}

export async function dropDatabase(name: string) {
  assertLocal()
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) return
  await run(adminUrl(), [`drop database if exists ${name} (force)`])
}
