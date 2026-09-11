/**
 * public schema дахь эрхийн ТӨЛӨВИЙГ уншиж, түүнийг яг сэргээх SQL үүсгэнэ.
 *
 * `aclexplode()` ашиглан aclitem-ийг (grantee, privilege, is_grantable) болгон
 * задалдаг тул гараар тайлбарлах алдаа гарахгүй.
 *
 * Буцаах SQL нь ЗӨВХӨН migration-ы хөндсөн grantee-үүдийн (anon, authenticated,
 * PUBLIC) БОДИТ эрхийг сэргээнэ — ерөнхий `GRANT ALL` хийхгүй.
 */
import { sql } from 'drizzle-orm'

/** Migration-ы хөндөх grantee-үүд. Буцаалт зөвхөн эдгээрийг хамарна. */
export const TARGET_GRANTEES = ['anon', 'authenticated', 'PUBLIC'] as const

export type GrantRow = {
  object: string
  kind: 'TABLE' | 'SEQUENCE' | 'FUNCTION' | 'SCHEMA'
  grantee: string
  privilege: string
  grantable: boolean
}

export type DefaultAclRow = {
  owner: string
  schema: string | null
  objtype: string
  grantee: string
  privilege: string
  grantable: boolean
}

export type GrantsSnapshot = {
  takenAt: string
  database: string
  currentUser: string
  grants: GrantRow[]
  defaultAcls: DefaultAclRow[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { execute: (q: any) => Promise<any> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (result: any): any[] => result.rows ?? result

const RELKIND_TO_SQL: Record<string, GrantRow['kind']> = {
  r: 'TABLE',
  v: 'TABLE',
  m: 'TABLE',
  f: 'TABLE',
  p: 'TABLE',
  S: 'SEQUENCE',
}

const DEFACL_OBJTYPE: Record<string, string> = {
  r: 'TABLES',
  S: 'SEQUENCES',
  f: 'FUNCTIONS',
  T: 'TYPES',
  n: 'SCHEMAS',
}

/** public schema дахь одоогийн эрхийг уншина (юу ч өөрчлөхгүй). */
export async function collectGrants(db: Executor, takenAt: string): Promise<GrantsSnapshot> {
  const meta = rows(
    await db.execute(sql`select current_database() as db, current_user as usr`),
  )[0]

  const relations = rows(
    await db.execute(sql`
      select c.relname as object, c.relkind::text as relkind,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind in ('r','v','m','f','p','S')
      order by c.relname, grantee, privilege
    `),
  )

  const functions = rows(
    await db.execute(sql`
      select p.oid::regprocedure::text as object,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) a
      where n.nspname = 'public'
      order by object, grantee, privilege
    `),
  )

  const schema = rows(
    await db.execute(sql`
      select 'public' as object,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_namespace n
      cross join lateral aclexplode(n.nspacl) a
      where n.nspname = 'public'
      order by grantee, privilege
    `),
  )

  const defaultAcls = rows(
    await db.execute(sql`
      select pg_get_userbyid(d.defaclrole) as owner,
             n.nspname as schema,
             d.defaclobjtype::text as objtype,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      order by owner, schema, objtype, grantee, privilege
    `),
  )

  const grants: GrantRow[] = [
    ...relations.map((r) => ({
      object: String(r.object),
      kind: RELKIND_TO_SQL[String(r.relkind)] ?? 'TABLE',
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
    ...functions.map((r) => ({
      object: String(r.object),
      kind: 'FUNCTION' as const,
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
    ...schema.map((r) => ({
      object: 'public',
      kind: 'SCHEMA' as const,
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
  ]

  return {
    takenAt,
    database: String(meta.db),
    currentUser: String(meta.usr),
    grants,
    defaultAcls: defaultAcls.map((r) => ({
      owner: String(r.owner),
      schema: r.schema === null ? null : String(r.schema),
      objtype: String(r.objtype),
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
  }
}

function quoteGrantee(grantee: string): string {
  return grantee === 'PUBLIC' ? 'PUBLIC' : `"${grantee.replace(/"/g, '""')}"`
}

function objectRef(row: GrantRow): string {
  if (row.kind === 'SCHEMA') return 'public'
  // FUNCTION-ийн object нь regprocedure (аргументтэй) — аль хэдийн бүрэн нэр
  if (row.kind === 'FUNCTION') return row.object
  return `public."${row.object.replace(/"/g, '""')}"`
}

/**
 * Snapshot-оос ЯГ тэр эрхийг сэргээх SQL үүсгэнэ.
 * Зөвхөн `grantees`-д заасан grantee-үүдийг хамарна.
 */
export function buildRestoreSql(
  snapshot: GrantsSnapshot,
  grantees: readonly string[] = TARGET_GRANTEES,
): string {
  const wanted = new Set(grantees)
  const lines: string[] = []

  lines.push('-- ============================================================')
  lines.push('-- public schema-ийн эрхийг БУЦААХ SQL (автоматаар үүсгэсэн)')
  lines.push('-- ============================================================')
  lines.push(`-- Хэмжсэн: ${snapshot.takenAt}`)
  lines.push(`-- Database: ${snapshot.database}   (уншсан дүр: ${snapshot.currentUser})`)
  lines.push(`-- Хамрах grantee: ${grantees.join(', ')}`)
  lines.push('--')
  lines.push('-- Энэ файл нь 0002_lockdown_public_grants.sql -ийг ажиллуулахын ӨМНӨХ')
  lines.push('-- БОДИТ төлөвийг сэргээнэ. Ерөнхий `GRANT ALL` ашигладаггүй — зөвхөн')
  lines.push('-- хэмжсэн эрхүүдийг нэг бүрчлэн буцаана.')
  lines.push('--')
  lines.push('-- АНХААР: үүнийг ажиллуулах нь Data API-ийн дүрүүдэд public schema-г')
  lines.push('-- дахин нээнэ. Зөвхөн санаатайгаар, шаардлагатай үед ажиллуулна.')
  lines.push('')

  // Grantee тус бүрийн (обьект, эрх)-ийг бүлэглэнэ
  const byObject = new Map<string, { ref: string; kind: string; grantee: string; privs: string[]; grantable: string[] }>()
  for (const row of snapshot.grants) {
    if (!wanted.has(row.grantee)) continue
    const key = `${row.kind}|${row.object}|${row.grantee}`
    const entry = byObject.get(key) ?? {
      ref: objectRef(row),
      kind: row.kind,
      grantee: row.grantee,
      privs: [],
      grantable: [],
    }
    ;(row.grantable ? entry.grantable : entry.privs).push(row.privilege)
    byObject.set(key, entry)
  }

  if (byObject.size === 0) {
    lines.push('-- (Хамрах grantee-үүдэд сэргээх обьектын эрх байхгүй)')
  }
  for (const entry of byObject.values()) {
    const target = quoteGrantee(entry.grantee)
    if (entry.privs.length > 0) {
      lines.push(`GRANT ${entry.privs.join(', ')} ON ${entry.kind} ${entry.ref} TO ${target};`)
    }
    if (entry.grantable.length > 0) {
      lines.push(
        `GRANT ${entry.grantable.join(', ')} ON ${entry.kind} ${entry.ref} TO ${target} WITH GRANT OPTION;`,
      )
    }
  }

  // Default privileges — зөвхөн public schema (migration өөр schema хөндөөгүй)
  lines.push('')
  lines.push('-- Default privileges (ирээдүйд үүсэх обьектод)')
  const byDefault = new Map<string, { owner: string; objtype: string; grantee: string; privs: string[] }>()
  for (const row of snapshot.defaultAcls) {
    if (!wanted.has(row.grantee)) continue
    if (row.schema !== 'public') continue
    const key = `${row.owner}|${row.objtype}|${row.grantee}`
    const entry = byDefault.get(key) ?? {
      owner: row.owner,
      objtype: row.objtype,
      grantee: row.grantee,
      privs: [],
    }
    entry.privs.push(row.privilege)
    byDefault.set(key, entry)
  }
  if (byDefault.size === 0) lines.push('-- (сэргээх default privilege байхгүй)')
  for (const entry of byDefault.values()) {
    const objtype = DEFACL_OBJTYPE[entry.objtype] ?? entry.objtype
    lines.push(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${entry.owner}" IN SCHEMA public ` +
        `GRANT ${entry.privs.join(', ')} ON ${objtype} TO ${quoteGrantee(entry.grantee)};`,
    )
  }

  lines.push('')
  return lines.join('\n')
}
