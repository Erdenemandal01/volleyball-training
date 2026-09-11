/**
 * 0002 lockdown болон буцаалтыг ЖИНХЭНЭ PostgreSQL дээр бүрэн шалгана.
 *
 *   npm run testpg:cluster -- up
 *   npm run testpg:verify
 *
 * PGlite (WASM) дээрх unit тестийг ОРЛОХГҮЙ — нөхнө. Эрхийн зан төлөв, дүрийн
 * систем, `pg_has_role`, MAINTAIN зэрэг нь жинхэнэ серверт л бүрэн шалгагдана.
 *
 * Production-д ХЭЗЭЭ Ч хүрэхгүй — зөвхөн 127.0.0.1 дээрх тестийн cluster.
 */
import { Client } from 'pg'
import { adminUrl, APP_ROLE, PLATFORM_ROLE, query } from './lib/pg-fixture'
import { applyMigrationFile, provision } from './testpg-provision'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function asRole<T>(database: string, role: string, statements: string[]): Promise<T[]> {
  const client = new Client({ connectionString: adminUrl(database) })
  await client.connect()
  try {
    await client.query(`set role ${role}`)
    let last: unknown[] = []
    for (const s of statements) last = (await client.query(s)).rows
    return last as T[]
  } finally {
    await client.end()
  }
}

/** Migration-ыг ажиллуулж, алдаа гарвал түүний мессежийг буцаана. */
async function runMigration(database: string, role = APP_ROLE): Promise<string | null> {
  try {
    await applyMigrationFile(database, '0002_lockdown_public_grants', role)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const one = async (db: string, sql: string): Promise<Record<string, unknown>> =>
  (await query(adminUrl(db), sql))[0]

async function main() {
  console.log('\n  ЖИНХЭНЭ PostgreSQL дээрх эрхийн шалгалт\n')
  const version = await one('postgres', 'select version() as v')
  console.log(`  ${String(version.v).split(',')[0]}\n`)

  // ── 1. Үндсэн хаалт ───────────────────────────────────────────────────
  console.log('  ── Үндсэн хаалт ──')
  await provision('vtv_main')
  const before = await one(
    'vtv_main',
    `select has_table_privilege('anon','public.students','SELECT') as x`,
  )
  check('Өмнө нь anon уншиж чаддаг байсан', before.x === true)
  check('Migration алдаагүй ажиллана', (await runMigration('vtv_main')) === null)
  const after = await one(
    'vtv_main',
    `select
       has_table_privilege('anon','public.students','SELECT') as anon_sel,
       has_table_privilege('anon','public.users','MAINTAIN') as anon_maint,
       has_column_privilege('anon','public.users','phone','SELECT') as anon_col,
       has_table_privilege('authenticated','public.payments','INSERT') as auth_ins,
       has_table_privilege('${APP_ROLE}','public.students','SELECT') as app_sel,
       has_table_privilege('service_role','public.students','SELECT') as svc_sel,
       has_schema_privilege('anon','public','USAGE') as anon_usage`,
  )
  check('anon хүснэгт уншихгүй', after.anon_sel === false)
  check('anon MAINTAIN (PG17) эрхгүй', after.anon_maint === false)
  check('anon баганын эрхгүй', after.anon_col === false)
  check('authenticated бичихгүй', after.auth_ins === false)
  check('АПП унших эрхтэй хэвээр', after.app_sel === true)
  check('service_role хөндөгдөөгүй', after.svc_sel === true)
  check('PUBLIC-ийн schema USAGE санаатай үлдсэн', after.anon_usage === true)
  check('Дахин ажиллуулахад идемпотент', (await runMigration('vtv_main')) === null)

  // ── 2. Системийн schema болон өөр эзэнтэй обьект ──────────────────────
  console.log('\n  ── Хамрах хүрээ ──')
  const scope = await one(
    'vtv_main',
    `select
       has_table_privilege('anon','auth.platform_tbl','SELECT') as sys,
       has_table_privilege('anon','public.platform_owned','SELECT') as foreign_obj,
       (select count(*) from pg_default_acl where defaclnamespace = 0)::int as global_acl`,
  )
  check('Системийн schema хөндөгдөөгүй', scope.sys === true)
  check('Өөр эзэнтэй обьект алгасагдсан', scope.foreign_obj === true)
  check('database-wide default ACL үүсээгүй', scope.global_acl === 0)

  // ── 3. PROCEDURE (өмнө нь бүх migration-ыг унагаадаг байсан) ──────────
  console.log('\n  ── Согогийн регресс ──')
  await provision('vtv_proc')
  await asRole('vtv_proc', APP_ROLE, [
    `create procedure public.pr() language sql as 'select 1'`,
    `create function public.fn() returns int language sql as 'select 1'`,
    `create aggregate public.ag(int) (sfunc=int4pl, stype=int)`,
  ])
  check('PROCEDURE байхад migration УНАХГҮЙ', (await runMigration('vtv_proc')) === null)
  const routines = await one(
    'vtv_proc',
    `select bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')) as locked
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public'`,
  )
  check('Функц/процедур/aggregate бүрийн эрх хураагдсан', routines.locked === true)

  // ── 4. Чадваргүй дүр ──────────────────────────────────────────────────
  await provision('vtv_role')
  await query(adminUrl('postgres'), `do $$ begin
    if not exists (select 1 from pg_roles where rolname='vtv_powerless') then
      create role vtv_powerless login nosuperuser;
    end if; end $$;`)
  await query(adminUrl('vtv_role'), `grant connect on database vtv_role to vtv_powerless`)
  const roleErr = await runMigration('vtv_role', 'vtv_powerless')
  check('Чадваргүй дүрээр ажиллуулбал АЛДАА өгнө', /хангалтгүй эрхтэй дүрээр/.test(roleErr ?? ''), roleErr ?? 'алдаа гараагүй')
  const stillOpen = await one(
    'vtv_role',
    `select has_table_privilege('anon','public.students','SELECT') as x`,
  )
  check('…мөн юу ч хаагдаагүй хэвээр (чимээгүй "амжилт" биш)', stillOpen.x === true)

  // ── 5. Гуравдагч дүрийн GRANT OPTION ──────────────────────────────────
  await provision('vtv_grantor')
  await query(adminUrl('postgres'), `do $$ begin
    if not exists (select 1 from pg_roles where rolname='vtv_mid') then
      create role vtv_mid nologin nosuperuser;
    end if; end $$;`)
  await asRole('vtv_grantor', APP_ROLE, [
    'grant select on public.students to vtv_mid with grant option',
  ])
  await asRole('vtv_grantor', 'vtv_mid', ['grant select on public.students to anon'])
  const midErr = await runMigration('vtv_grantor')
  check(
    'Гуравдагч grantor-ын үлдсэн эрхийг барина',
    /Хаалт бүрэн болсонгүй/.test(midErr ?? ''),
    midErr ?? 'алдаа гараагүй',
  )

  // ── 6. Баримтжуулсан цоорхой үнэхээр байгаа эсэх ──────────────────────
  console.log('\n  ── Баримтжуулсан цоорхойнууд (байгааг нь БАТАЛНА) ──')
  await asRole('vtv_main', APP_ROLE, [
    `create function public.late_fn() returns int language sql as 'select 1'`,
  ])
  const gap1 = await one(
    'vtv_main',
    `select has_function_privilege('anon','public.late_fn()','EXECUTE') as x`,
  )
  check('№1 ирээдүйн функцийн PUBLIC EXECUTE — цоорхой БАЙНА', gap1.x === true)
  await asRole('vtv_main', PLATFORM_ROLE, ['create table public.late_tbl(id int)'])
  const gap2 = await one(
    'vtv_main',
    `select has_table_privilege('anon','public.late_tbl','SELECT') as x`,
  )
  check('№2 платформын шинэ обьект — цоорхой БАЙНА', gap2.x === true)
  const gap3 = await one(
    'vtv_main',
    `select count(*) filter (where rowsecurity)::int as rls from pg_tables where schemaname='public'`,
  )
  check('№5 RLS нөөц давхарга БАЙХГҮЙ (0 хүснэгт)', gap3.rls === 0)

  // ── 7. Эзэмшил нь өгөгдлийн хандалтыг хамгаалдаггүй ───────────────────
  const owner = await asRole<Record<string, unknown>>('vtv_main', APP_ROLE, [
    'begin',
    `revoke all privileges on table public.users from ${APP_ROLE}, service_role`,
    `select has_table_privilege('${APP_ROLE}','public.users','SELECT') as x`,
  ])
  check('Эзэмшил нь ӨГӨГДЛИЙН хандалтыг хамгаалдаггүй (баримтжуулсан)', owner[0].x === false)

  console.log(`\n  Дүн: ${passed} амжилттай, ${failed} амжилтгүй\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n  ✗ Алдаа:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
