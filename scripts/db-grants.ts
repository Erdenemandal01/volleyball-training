/**
 * public schema дахь эрхийн аудит — ЗӨВХӨН УНШИНА, юу ч өөрчлөхгүй.
 *
 *   npm run db:grants                # DATABASE_URL дээр тайлан
 *   npm run db:grants -- --direct    # DIRECT_DATABASE_URL дээр
 *   npm run db:grants -- --strict    # ил задрал илэрвэл exit 1 (CI / тогтмол хяналт)
 *
 * Supabase-ийн Data API (PostgREST) нь `anon` / `authenticated` дүрээр ажилладаг.
 * Энэ апп Data API ашигладаггүй тул тэдгээрт public schema-д хандах эрх
 * шаардлагагүй. Data API-г дахин асаах, эсвэл платформын шинэчлэлт нь эрхийг
 * буцаан тавьж болзошгүй тул үүнийг тогтмол ажиллуулахыг зөвлөнө.
 */
import './env'
import { sql } from 'drizzle-orm'
import { createDb } from '../src/db/client'

const LOCKED_ROLES = ['anon', 'authenticated'] as const

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rows(result: any): any[] {
  return result.rows ?? result
}

/** aclitem мөрөнд PUBLIC-ийн бичлэг байгаа эсэх (grantee нь хоосон: "=UC/owner"). */
function aclHasPublic(acl: string): boolean {
  return /(^|,\s*)=/.test(acl)
}

/** Урт жагсаалтыг таслана (тайлан уншигдахуйц байлгах). */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

const problems: string[] = []
const flag = (message: string) => {
  problems.push(message)
  return '⚠'
}

async function main() {
  const useDirect = process.argv.includes('--direct')
  const strict = process.argv.includes('--strict')
  const url = (useDirect ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL) ?? ''
  if (!url || url.includes('[YOUR-PASSWORD]')) {
    console.error('\n  ✗ Холболтын мөр тохируулаагүй байна.\n')
    process.exit(1)
  }

  const db = createDb(url)
  console.log(`\n  Холболт: ${maskUrl(url)}`)

  /* ---------------- 0. Урьдчилсан нөхцөл (migration ажиллах уу) ---------------- */
  const ctx = rows(
    await db.execute(sql`
      select current_user as me,
             pg_get_userbyid(d.datdba) as db_owner,
             (select pg_get_userbyid(nspowner) from pg_namespace where nspname = 'public') as schema_owner,
             pg_has_role(current_user, 'pg_database_owner', 'USAGE') as owns_schema,
             has_schema_privilege(current_user, 'public', 'CREATE') as can_create
      from pg_database d where d.datname = current_database()
    `),
  )[0]

  console.log(`  Аппын DB хэрэглэгч: ${ctx.me}`)
  console.log('\n  ── 0. Урьдчилсан нөхцөл ──')
  console.log(`    public schema эзэмшигч : ${ctx.schema_owner}`)
  console.log(
    `    Schema дээр REVOKE хийх эрх: ${ctx.owns_schema ? 'тийм' : 'ҮГҮЙ — schema түвшний хураалт үр дүнгүй болно'}`,
  )
  console.log(`    public дээр CREATE      : ${ctx.can_create ? 'тийм' : 'ҮГҮЙ'}`)
  if (!ctx.owns_schema) flag('Аппын дүр public schema дээр REVOKE хийх эрхгүй')
  if (!ctx.can_create) flag('Аппын дүр public дээр CREATE хийж чадахгүй — migration унана')

  const foreign = rows(
    await db.execute(sql`
      select c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','v','m','f','p','S')
        and c.relowner <> (select oid from pg_roles where rolname = current_user)
    `),
  )
  console.log(`    Өөр эзэнтэй обьект      : ${foreign.length}`)
  for (const f of foreign) console.log(`      · ${f.relname} ← ${f.owner}`)

  /* ---------------- 1. Schema түвшний эрх ---------------- */
  console.log('\n  ── 1. public schema дээрх эрх ──')
  const nspacl = String(
    rows(
      await db.execute(sql`
        select coalesce(array_to_string(nspacl, ', '), '(default)') as acl
        from pg_namespace where nspname = 'public'
      `),
    )[0].acl,
  )
  const schemaRows = rows(
    await db.execute(sql`
      select r.rolname as role,
             has_schema_privilege(r.rolname, 'public', 'USAGE') as usage
      from pg_roles r
      where r.rolname in ('anon', 'authenticated', 'service_role')
      order by r.rolname
    `),
  )
  console.log('    дүр              шууд-олгосон   бодит-USAGE (PUBLIC-аар дамжсныг оруулна)')
  for (const r of schemaRows) {
    const direct = nspacl.includes(`${r.role}=`)
    const mark =
      LOCKED_ROLES.includes(r.role as (typeof LOCKED_ROLES)[number]) && direct
        ? flag(`${r.role} нь public schema дээр шууд эрхтэй`)
        : ' '
    console.log(
      `  ${mark} ${String(r.role).padEnd(16)} ${String(direct).padEnd(14)} ${r.usage}`,
    )
  }
  console.log(`    nspacl: ${nspacl}`)

  /* ---------------- 2. Хүснэгтийн эрх ---------------- */
  console.log('\n  ── 2. Хүснэгтийн эрх ──')
  // ЯАГААД information_schema БИШ вэ (жинхэнэ PostgreSQL 17 дээр хэмжсэн):
  //   • `role_table_grants` нь зөвхөн АЖИЛЛУУЛЖ БУЙ дүрийн гишүүн байх
  //     grantee-үүдийн эрхийг харуулдаг. Энэ нь зөвхөн `postgres` нь anon,
  //     authenticated-ийн гишүүн учраас ажиллаж байсан. Тэр гишүүнчлэлийг
  //     (аюулгүй байдлын үүднээс ч гэсэн) авбал аудит СОХОР болно.
  //   • PostgreSQL 17-ийн MAINTAIN эрхийг тэр view ОРУУЛДАГГҮЙ — relacl-д
  //     `arwdDxtm` (8 эрх) байхад тайланд 7 эрх харагдана.
  // Тиймээс каталогоос `aclexplode`-оор шууд уншина.
  const tableGrants = rows(
    await db.execute(sql`
      select g.who as grantee,
             count(distinct c.relname)::int as tables,
             string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as privs,
             string_agg(distinct c.relname, ', ' order by c.relname) as names
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      cross join lateral (
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as who
      ) g
      where n.nspname = 'public' and c.relkind in ('r','v','m','f','p')
        and g.who in ('anon', 'authenticated', 'PUBLIC')
      group by g.who order by g.who
    `),
  )
  if (tableGrants.length === 0) {
    console.log('    ✓ anon / authenticated / PUBLIC-д эрх байхгүй')
  } else {
    for (const g of tableGrants) {
      const mark = flag(`${g.grantee} нь ${g.tables} хүснэгтэд эрхтэй (${g.privs})`)
      console.log(`  ${mark} ${String(g.grantee).padEnd(16)} ${g.tables} хүснэгт · ${g.privs}`)
      // Аль хүснэгт болохыг нэрлэнэ — тоо ганцаараа CI-д хангалтгүй
      console.log(`      ${truncate(String(g.names), 150)}`)
    }
  }

  /* ---------------- 3. Баганы түвшний эрх ---------------- */
  console.log('\n  ── 3. Баганы түвшний эрх (хүснэгтийн эрхээс үл хамаарах) ──')
  // `information_schema.column_privileges` нь ХҮСНЭГТИЙН эрхийг багана бүрээр
  // задалж харуулдаг тул жинхэнэ баганын GRANT-ыг нуудаг. `pg_attribute.attacl`
  // нь зөвхөн ТОДОРХОЙ олгосон баганын ACL-ыг агуулна.
  const colGrants = rows(
    await db.execute(sql`
      select g.who as grantee, c.relname as table_name, att.attname as column_name,
             a.privilege_type
      from pg_attribute att
      join pg_class c on c.oid = att.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(att.attacl) a
      cross join lateral (
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as who
      ) g
      where n.nspname = 'public' and att.attnum > 0 and att.attacl is not null
        and g.who in ('anon', 'authenticated', 'PUBLIC')
      order by grantee, table_name, column_name
    `),
  )
  if (colGrants.length === 0) console.log('    ✓ байхгүй')
  else
    for (const c of colGrants) {
      const mark = flag(`${c.grantee} нь ${c.table_name}.${c.column_name} дээр ${c.privilege_type}`)
      console.log(`  ${mark} ${c.grantee} → ${c.table_name}.${c.column_name} (${c.privilege_type})`)
    }

  /* ---------------- 4. Sequence эрх (pg_class-аас — SELECT/UPDATE ч харагдана) --- */
  console.log('\n  ── 4. Sequence эрх ──')
  const seqs = rows(
    await db.execute(sql`
      select c.relname, coalesce(array_to_string(c.relacl, ', '), '(default)') as acl
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'S' order by c.relname
    `),
  )
  if (seqs.length === 0) console.log('    public schema-д sequence байхгүй')
  else
    for (const s of seqs) {
      // `aclHasPublic` ЗААВАЛ хэрэгтэй: PUBLIC-ийн ACL бичлэг нь `=U/эзэн` буюу
      // grantee нэргүй эхэлдэг тул `LOCKED_ROLES` дэх substring шалгалт
      // түүнийг ХЭЗЭЭ Ч олохгүй (5-р хэсэгтэй ижил дүрэм).
      const acl = String(s.acl)
      const exposed =
        aclHasPublic(acl) || LOCKED_ROLES.some((r) => acl.includes(`${r}=`))
      const mark = exposed ? flag(`${s.relname} sequence нээлттэй: ${acl}`) : ' '
      console.log(`  ${mark} ${String(s.relname).padEnd(28)} ${s.acl}`)
    }

  /* ---------------- 5. Function эрх ---------------- */
  console.log('\n  ── 5. Function / procedure эрх ──')
  const funcs = rows(
    await db.execute(sql`
      select p.proname, coalesce(array_to_string(p.proacl, ', '), '(default: PUBLIC EXECUTE)') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' order by p.proname
    `),
  )
  if (funcs.length === 0) console.log('    ✓ public schema-д өөрийн function байхгүй')
  else
    for (const f of funcs) {
      const acl = String(f.acl)
      const exposed = acl.includes('(default') || aclHasPublic(acl) ||
        LOCKED_ROLES.some((r) => acl.includes(`${r}=`))
      const mark = exposed ? flag(`${f.proname} функц нээлттэй: ${acl}`) : ' '
      console.log(`  ${mark} ${String(f.proname).padEnd(28)} ${acl}`)
    }

  /* ---------------- 6. Дүрийн гишүүнчлэл ---------------- */
  console.log('\n  ── 6. anon / authenticated-д олгосон дүрийн гишүүнчлэл ──')
  const memberships = rows(
    await db.execute(sql`
      select r.rolname as member, g.rolname as granted_role
      from pg_auth_members m
      join pg_roles r on r.oid = m.member
      join pg_roles g on g.oid = m.roleid
      where r.rolname in ('anon', 'authenticated')
      order by r.rolname, g.rolname
    `),
  )
  if (memberships.length === 0) console.log('    ✓ байхгүй')
  else
    for (const m of memberships) {
      const mark = flag(`${m.member} нь ${m.granted_role} дүрийн гишүүн`)
      console.log(`  ${mark} ${m.member} ← ${m.granted_role}`)
    }

  /* ---------------- 7. Default privileges ---------------- */
  console.log('\n  ── 7. Default privileges (ирээдүйд үүсэх обьектод) ──')
  const defs = rows(
    await db.execute(sql`
      select pg_get_userbyid(d.defaclrole) as owner,
             coalesce(n.nspname, '(бүх schema)') as schema,
             case d.defaclobjtype when 'r' then 'table' when 'S' then 'sequence'
                                  when 'f' then 'function' when 'T' then 'type'
                                  else d.defaclobjtype::text end as objtype,
             array_to_string(d.defaclacl, ', ') as acl
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      order by owner, schema, objtype
    `),
  )
  const relevant = defs.filter(
    (d) => d.schema === 'public' || d.schema === '(бүх schema)',
  )
  for (const d of relevant) {
    const acl = String(d.acl)
    // PUBLIC-д олгодог дүрэм нь ирээдүйн обьект бүрийг нээлттэй болгоно —
    // `aclHasPublic` байхгүй бол энэ дүрэм илрэхгүй өнгөрдөг байсан.
    const exposed = aclHasPublic(acl) || LOCKED_ROLES.some((r) => acl.includes(`${r}=`))
    const mark = exposed
      ? flag(`${d.owner} дүрийн default privileges нь ${d.schema}/${d.objtype} дээр эрх өгсөөр байна`)
      : ' '
    console.log(`  ${mark} ${d.owner}/${d.schema}/${d.objtype}: ${acl}`)
  }
  const systemDefs = defs.length - relevant.length
  if (systemDefs > 0) {
    console.log(`    (Supabase системийн schema-гийн ${systemDefs} мөрийг алгасав)`)
  }

  /* ---------------- 8. RLS ---------------- */
  console.log('\n  ── 8. RLS төлөв (мэдээлэл) ──')
  const rls = rows(
    await db.execute(sql`
      select count(*)::int as total, count(*) filter (where rowsecurity)::int as enabled
      from pg_tables where schemaname = 'public'
    `),
  )[0]
  console.log(`    ${rls.enabled} / ${rls.total} хүснэгтэд RLS идэвхтэй`)
  console.log('    (Энэ апп Supabase Auth ашигладаггүй тул RLS policy зориуд нэмээгүй —')
  console.log('     хамгаалалт нь дээрх GRANT хураалт. README-гийн 10b хэсгийг үз.)')

  /* ---------------- Дүгнэлт ---------------- */
  console.log('')
  if (problems.length === 0) {
    console.log('  ✓ anon / authenticated дүрүүдэд public schema-д ил задрал олдсонгүй\n')
    process.exit(0)
  }

  console.log(`  ⚠ ${problems.length} анхаарах зүйл:`)
  for (const p of problems) console.log(`    · ${p}`)
  console.log('')
  process.exit(strict ? 1 : 0)
}

main().catch((error) => {
  console.error('\n  ✗ Аудит амжилтгүй:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
