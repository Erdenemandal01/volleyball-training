/**
 * public schema дахь эрхийн ТӨЛӨВИЙГ уншиж, түүнийг яг сэргээх SQL үүсгэнэ.
 *
 * `aclexplode()` ашиглан aclitem-ийг (grantee, privilege, is_grantable) болгон
 * задалдаг тул гараар тайлбарлах алдаа гарахгүй.
 *
 * Буцаах SQL нь ЗӨВХӨН migration-ы хөндсөн grantee-үүдийн (anon, authenticated,
 * PUBLIC) БОДИТ эрхийг сэргээнэ — ерөнхий `GRANT ALL` хийхгүй.
 *
 * ХАМРАХ ХҮРЭЭНИЙ ЧУХАЛ ДҮРЭМ (жинхэнэ PostgreSQL 17 дээр хэмжиж тогтоосон):
 *   Migration нь зөвхөн ӨӨРИЙН ЭЗЭМШДЭГ обьект болон ӨӨРИЙН default privileges-ийг
 *   хөнддөг. Тиймээс буцаалт ч яг тэр хүрээг сэргээнэ. Өөр дүрийн эзэмшдэг
 *   обьект (жишээ нь Supabase платформын үүсгэсэн хүснэгт) болон өөр дүрийн
 *   default privileges нь:
 *     • migration-аар хөндөгдөөгүй тул сэргээх ШААРДЛАГАГҮЙ, БА
 *     • `ALTER DEFAULT PRIVILEGES FOR ROLE <өөр дүр>` нь "permission denied to
 *       change default privileges" алдаа өгч БҮХ буцаалтыг зогсооно.
 *   Тиймээс тэдгээрийг гүйцэтгэх SQL болгон БИЧИХГҮЙ — зөвхөн тайлбар хэлбэрээр
 *   бүртгэнэ.
 */
import { sql } from 'drizzle-orm'

/** Migration-ы хөндөх grantee-үүд. Буцаалт зөвхөн эдгээрийг хамарна. */
export const TARGET_GRANTEES = ['anon', 'authenticated', 'PUBLIC'] as const

export type GrantRow = {
  object: string
  kind: 'TABLE' | 'SEQUENCE' | 'FUNCTION' | 'SCHEMA' | 'COLUMN'
  /** Обьектын эзэмшигч. SCHEMA-д public schema-ийн эзэн. */
  owner: string
  /** Зөвхөн kind='COLUMN' үед. */
  column?: string
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
  /**
   * Snapshot авсан дүрийн НЭРЭЭР ажиллаж чадах бүх дүр (`pg_has_role(..., 'USAGE')`).
   * Эзэмшлийг шууд харьцуулах нь БУРУУ: `public` schema-ийн эзэн нь ихэвчлэн
   * `pg_database_owner` бөгөөд өгөгдлийн сангийн эзэн түүний ДАЛД гишүүн байдаг.
   * Тиймээс "би үүнийг дахин GRANT хийж чадах уу?" гэдгийг PostgreSQL-ээр
   * тооцуулж, энэ жагсаалтаар шийднэ.
   */
  actAsRoles: string[]
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
             pg_get_userbyid(c.relowner) as owner,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
      where n.nspname = 'public' and c.relkind in ('r','v','m','f','p','S')
      order by c.relname, grantee, privilege
    `),
  )

  // Баганын түвшний ТОДОРХОЙ GRANT (pg_attribute.attacl). Хүснэгтийн түвшний
  // REVOKE эдгээрийг ч авдаг тул буцаалтад заавал орох ёстой.
  const columns = rows(
    await db.execute(sql`
      select c.relname as object, att.attname as column,
             pg_get_userbyid(c.relowner) as owner,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             a.privilege_type as privilege, a.is_grantable as grantable
      from pg_attribute att
      join pg_class c on c.oid = att.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(att.attacl) a
      where n.nspname = 'public' and att.attacl is not null and att.attnum > 0
      order by c.relname, att.attname, grantee, privilege
    `),
  )

  const functions = rows(
    await db.execute(sql`
      select p.oid::regprocedure::text as object,
             pg_get_userbyid(p.proowner) as owner,
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
             pg_get_userbyid(n.nspowner) as owner,
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
      kind: RELKIND_TO_SQL[String(r.relkind)] ?? ('TABLE' as const),
      owner: String(r.owner),
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
    ...columns.map((r) => ({
      object: String(r.object),
      kind: 'COLUMN' as const,
      owner: String(r.owner),
      column: String(r.column),
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
    ...functions.map((r) => ({
      object: String(r.object),
      kind: 'FUNCTION' as const,
      owner: String(r.owner),
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
    ...schema.map((r) => ({
      object: 'public',
      kind: 'SCHEMA' as const,
      owner: String(r.owner),
      grantee: String(r.grantee),
      privilege: String(r.privilege),
      grantable: r.grantable === true,
    })),
  ]

  // Аль дүрийн нэрээр GRANT/ALTER DEFAULT PRIVILEGES хийж чадахыг PostgreSQL-ээр
  // тооцуулна (далд pg_database_owner гишүүнчлэл ч үүнд орно).
  const actAs = rows(
    await db.execute(sql`
      select rolname from pg_roles
      where pg_has_role(current_user, oid, 'USAGE')
      order by rolname
    `),
  ).map((r) => String(r.rolname))

  return {
    takenAt,
    database: String(meta.db),
    currentUser: String(meta.usr),
    actAsRoles: actAs,
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

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function objectRef(row: GrantRow): string {
  if (row.kind === 'SCHEMA') return 'public'
  // FUNCTION-ийн object нь regprocedure (аргументтэй) — аль хэдийн бүрэн нэр
  if (row.kind === 'FUNCTION') return row.object
  return `public.${quoteIdent(row.object)}`
}

/**
 * Snapshot-оос ЯГ тэр эрхийг сэргээх SQL үүсгэнэ.
 *
 * Гүйцэтгэх мөрүүдэд ЗӨВХӨН snapshot авсан дүрийн эзэмшдэг обьект болон
 * түүний өөрийн default privileges орно — учир нь migration ч яг тэр хүрээг
 * хөнддөг. Бусдыг нь тайлбар болгон бүртгэнэ (доорх толгойн тайлбарыг үз).
 */
export function buildRestoreSql(
  snapshot: GrantsSnapshot,
  grantees: readonly string[] = TARGET_GRANTEES,
): string {
  const wanted = new Set(grantees)
  const me = snapshot.currentUser
  // Хуучин snapshot файлд actAsRoles байхгүй байж болно — тэр үед зөвхөн өөрийгөө.
  const canActAs = new Set(snapshot.actAsRoles ?? [me])
  canActAs.add(me)
  const lines: string[] = []
  const skipped: string[] = []

  lines.push('-- ============================================================')
  lines.push('-- public schema-ийн эрхийг БУЦААХ SQL (автоматаар үүсгэсэн)')
  lines.push('-- ============================================================')
  lines.push(`-- Хэмжсэн: ${snapshot.takenAt}`)
  lines.push(`-- Database: ${snapshot.database}   (уншсан дүр: ${me})`)
  lines.push(`-- Хамрах grantee: ${grantees.join(', ')}`)
  lines.push('--')
  lines.push('-- Энэ файл нь 0002_lockdown_public_grants.sql -ийг ажиллуулахын ӨМНӨХ')
  lines.push('-- БОДИТ төлөвийг сэргээнэ. Ерөнхий `GRANT ALL` ашигладаггүй — зөвхөн')
  lines.push('-- хэмжсэн эрхүүдийг нэг бүрчлэн буцаана.')
  lines.push('--')
  lines.push(`-- ХАМРАХ ХҮРЭЭ: зөвхөн "${me}" дүрийн нэрээр дахин олгож ЧАДАХ эрхүүд`)
  lines.push('-- (обьектын эзэн нь өөрөө, эсвэл түүний гишүүн байх дүр). Migration ч')
  lines.push('-- яг тэр хүрээг хөнддөг тул бусдыг сэргээх шаардлагагүй; түүнчлэн өөр')
  lines.push('-- дүрийн default privileges-ийг өөрчлөхийг оролдвол "permission denied')
  lines.push('-- to change default privileges" алдаа гарч буцаалт дунд замдаа зогсоно.')
  lines.push('-- Эзэн нь өөр дүр байвал grantor-ыг ЯГ сэргээхийн тулд `SET ROLE`-оор')
  lines.push('-- шилжинэ (жишээ нь public schema-ийн эзэн `pg_database_owner`).')
  lines.push('--')
  lines.push('-- АНХААР: үүнийг ажиллуулах нь Data API-ийн дүрүүдэд public schema-г')
  lines.push('-- дахин нээнэ. Зөвхөн санаатайгаар, шаардлагатай үед ажиллуулна.')
  lines.push('')

  // ── Обьектын эрхүүд ────────────────────────────────────────────────────
  type Entry = {
    ref: string
    kind: string
    owner: string
    grantee: string
    /** privilege -> баганы жагсаалт (COLUMN биш бол хоосон) */
    privs: Map<string, string[]>
    grantable: Map<string, string[]>
  }
  const byObject = new Map<string, Entry>()

  for (const row of snapshot.grants) {
    if (!wanted.has(row.grantee)) continue
    if (!canActAs.has(row.owner)) {
      skipped.push(
        `${row.kind} ${row.kind === 'COLUMN' ? `${row.object}.${row.column}` : row.object}` +
          ` → ${row.grantee} (${row.privilege}); эзэмшигч: ${row.owner}`,
      )
      continue
    }
    const isColumn = row.kind === 'COLUMN'
    const sqlKind = isColumn ? 'TABLE' : row.kind
    const key = `${sqlKind}|${row.object}|${row.grantee}|${isColumn ? 'col' : 'obj'}`
    const entry =
      byObject.get(key) ??
      ({
        ref: objectRef(row),
        kind: sqlKind,
        owner: row.owner,
        grantee: row.grantee,
        privs: new Map(),
        grantable: new Map(),
      } as Entry)
    const bucket = row.grantable ? entry.grantable : entry.privs
    const cols = bucket.get(row.privilege) ?? []
    if (isColumn && row.column) cols.push(row.column)
    bucket.set(row.privilege, cols)
    byObject.set(key, entry)
  }

  const render = (privs: Map<string, string[]>): string =>
    [...privs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([priv, cols]) =>
        cols.length > 0 ? `${priv} (${cols.map(quoteIdent).join(', ')})` : priv,
      )
      .join(', ')

  if (byObject.size === 0) {
    lines.push('-- (Хамрах grantee-үүдэд сэргээх обьектын эрх байхгүй)')
  }
  // Эзэмшигчээр нь бүлэглэнэ: GRANT-ын grantor нь ажиллуулж буй дүр болдог тул
  // өөр эзэнтэй обьектод `SET ROLE`-оор шилжиж, ЯГ өмнөх grantor-ыг сэргээнэ.
  const entries = [...byObject.values()].sort(
    (a, b) => a.owner.localeCompare(b.owner) || a.ref.localeCompare(b.ref),
  )
  let activeRole: string | null = null
  for (const entry of entries) {
    const needRole = entry.owner === me ? null : entry.owner
    if (needRole !== activeRole) {
      if (activeRole !== null) lines.push('RESET ROLE;')
      if (needRole !== null) lines.push(`SET ROLE ${quoteIdent(needRole)};`)
      activeRole = needRole
    }
    const target = quoteGrantee(entry.grantee)
    if (entry.privs.size > 0) {
      lines.push(`GRANT ${render(entry.privs)} ON ${entry.kind} ${entry.ref} TO ${target};`)
    }
    if (entry.grantable.size > 0) {
      lines.push(
        `GRANT ${render(entry.grantable)} ON ${entry.kind} ${entry.ref} TO ${target} WITH GRANT OPTION;`,
      )
    }
  }
  if (activeRole !== null) lines.push('RESET ROLE;')

  // ── Default privileges (зөвхөн ӨӨРИЙН, зөвхөн public) ──────────────────
  lines.push('')
  lines.push('-- Default privileges (ирээдүйд үүсэх обьектод)')
  const byDefault = new Map<
    string,
    { owner: string; objtype: string; grantee: string; privs: string[] }
  >()
  for (const row of snapshot.defaultAcls) {
    if (!wanted.has(row.grantee)) continue
    if (row.schema !== 'public') continue
    if (!canActAs.has(row.owner)) {
      skipped.push(
        `DEFAULT PRIVILEGES (${DEFACL_OBJTYPE[row.objtype] ?? row.objtype}) → ${row.grantee}` +
          ` (${row.privilege}); эзэмшигч: ${row.owner}`,
      )
      continue
    }
    const key = `${row.owner}|${row.objtype}|${row.grantee}`
    const entry =
      byDefault.get(key) ?? { owner: row.owner, objtype: row.objtype, grantee: row.grantee, privs: [] }
    entry.privs.push(row.privilege)
    byDefault.set(key, entry)
  }
  if (byDefault.size === 0) lines.push('-- (сэргээх default privilege байхгүй)')
  for (const entry of byDefault.values()) {
    const objtype = DEFACL_OBJTYPE[entry.objtype] ?? entry.objtype
    lines.push(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdent(entry.owner)} IN SCHEMA public ` +
        `GRANT ${entry.privs.sort().join(', ')} ON ${objtype} TO ${quoteGrantee(entry.grantee)};`,
    )
  }

  // ── Хамрахгүй үлдсэн зүйлс (зөвхөн бүртгэл) ────────────────────────────
  lines.push('')
  lines.push('-- ------------------------------------------------------------')
  lines.push('-- ЭНЭ БУЦААЛТАД ОРООГҮЙ (migration ч тэдгээрийг хөндөөгүй)')
  lines.push('-- ------------------------------------------------------------')
  if (skipped.length === 0) {
    lines.push('-- (байхгүй)')
  } else {
    const unique = [...new Set(skipped)].sort()
    for (const item of unique.slice(0, 200)) lines.push(`--   ${item}`)
    if (unique.length > 200) lines.push(`--   … өөр ${unique.length - 200} мөр`)
  }

  lines.push('')
  return lines.join('\n')
}
