/**
 * ЖИНХЭНЭ PostgreSQL 17 дээр нэвтрэлтийн бүтэн урсгалыг шалгана (PGlite БИШ).
 *
 *   npx tsx scripts/testpg-login-check.ts
 *
 * Юу хийдэг:
 *   1. Тусгаарласан cluster дээр `vt_login` сан бэлдэж, 0002 lockdown-ыг ХЭРЭГЛЭНЭ.
 *   2. Санамсаргүй нууц үг/код үүсгэж (зөвхөн санах ойд), админ + эцэг эх + сурагч үүсгэнэ.
 *   3. Аппыг тэр сан руу чиглүүлж асаана.
 *   4. Бодит HTTP нэвтрэлт хийж: буруу итгэмжлэл татгалзах, ЗӨВ итгэмжлэл
 *      АМЖИЛТТАЙ нэвтрэх, эрхийн тусгаарлалт ажиллахыг тусад нь шалгана.
 *
 * Нууц утгыг ХЭЗЭЭ Ч хэвлэхгүй, аргумент болгон дамжуулахгүй, файлд бичихгүй.
 * Production-д ХЭЗЭЭ Ч хүрэхгүй — зөвхөн 127.0.0.1:55432.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import { Client } from 'pg'
import { provision } from './testpg-provision'
import { appUrlFor } from './lib/pg-fixture'
import { hashSecret } from '../src/lib/password'

const DB = 'vt_login'
const PORT = Number(process.env.LOGIN_CHECK_PORT ?? 3210)
const BASE = `http://127.0.0.1:${PORT}`

let passed = 0
let failed = 0
const skipped: string[] = []

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function skip(name: string, reason: string) {
  skipped.push(`${name} (${reason})`)
  console.log(`  • ШАЛГААГҮЙ: ${name} — ${reason}`)
}

/** Урьдчилан таамаглах боломжгүй нууц утга. Хэвлэхгүй. */
function secret(bytes = 18): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

type Jar = { cookie: string }

async function call(jar: Jar, path: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      ...(init.headers ?? {}),
    },
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) jar.cookie = setCookie.split(';')[0]
  return response
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (r.status < 500) return true
    } catch {
      /* сервер хараахан бэлэн биш */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function seedAccounts(adminEmail: string, adminPassword: string, parentPhone: string, parentCode: string) {
  const client = new Client({ connectionString: appUrlFor(DB) })
  await client.connect()
  try {
    const adminHash = await hashSecret(adminPassword)
    const parentHash = await hashSecret(parentCode)
    await client.query(
      `insert into users (role, email, display_name, password_hash) values ('admin', $1, 'Тест админ', $2)`,
      [adminEmail, adminHash],
    )
    const parent = await client.query(
      `insert into users (role, phone, display_name, password_hash) values ('parent', $1, 'Тест эцэг эх', $2) returning id`,
      [parentPhone, parentHash],
    )
    const group = await client.query(
      `insert into training_groups (name) values ('Анхан шат') returning id`,
    )
    const student = await client.query(
      `insert into students (full_name, registered_at, current_group_id) values ('Тест сурагч', current_date, $1) returning id`,
      [group.rows[0].id],
    )
    await client.query(`insert into parent_students (parent_user_id, student_id) values ($1, $2)`, [
      parent.rows[0].id,
      student.rows[0].id,
    ])
    const counts = await client.query(
      `select (select count(*) from users)::int as users, (select count(*) from students)::int as students`,
    )
    return counts.rows[0]
  } finally {
    await client.end()
  }
}

async function main() {
  console.log('\n  ЖИНХЭНЭ PostgreSQL 17 дээрх нэвтрэлтийн шалгалт (PGlite БИШ)\n')

  console.log('  → Тусгаарласан сан бэлтгэж, 0002 lockdown-ыг хэрэглэж байна...')
  const { n2 } = await provision(DB, true)
  console.log(`    ${DB} бэлэн, lockdown: ${n2} statement`)

  // Нууц утгууд — зөвхөн энэ процессын санах ойд
  const adminEmail = `admin-${crypto.randomBytes(4).toString('hex')}@test.local`
  const adminPassword = secret()
  const parentPhone = `9${Math.floor(crypto.randomBytes(4).readUInt32BE(0) % 9_000_000 + 1_000_000)}`
  const parentCode = secret(12)

  const counts = await seedAccounts(adminEmail, adminPassword, parentPhone, parentCode)
  console.log(`    Бүртгэл үүслээ: users=${counts.users}, students=${counts.students}`)

  console.log(`  → Аппыг ${BASE} дээр асааж байна (lockdown хэрэглэсэн сан руу)...`)
  const env = {
    ...process.env,
    DATABASE_URL: appUrlFor(DB),
    DIRECT_DATABASE_URL: appUrlFor(DB),
    NODE_ENV: 'development' as const,
  }
  // Windows дээр .cmd shim дуудахын тулд shell хэрэгтэй. Аргументыг shell-д
  // задлуулахгүйн тулд команд болон PORT-ыг өөрсдөө хатуу хянана (PORT нь Number).
  const server: ChildProcess = spawn(`npx next dev -p ${PORT}`, {
    cwd: process.cwd(),
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const serverLog: string[] = []
  server.stdout?.on('data', (d) => serverLog.push(String(d)))
  server.stderr?.on('data', (d) => serverLog.push(String(d)))

  try {
    const up = await waitForServer(150_000)
    if (!up) {
      skip('Бүх HTTP нэвтрэлтийн шалгалт', 'сервер асаагүй')
      console.log('\n  Серверийн сүүлийн гаралт:\n' + serverLog.slice(-12).join(''))
    } else {
      console.log('    Сервер бэлэн.\n')

      // ── 1. Нэвтрээгүй үеийн хамгаалалт ───────────────────────────────────
      const anon: Jar = { cookie: '' }
      const guardApi = await call(anon, '/api/admin/students')
      check('Нэвтрээгүй үед admin API 401', guardApi.status === 401, `status ${guardApi.status}`)

      // ── 2. БУРУУ итгэмжлэл (энэ нь амжилттай нэвтрэлт БИШ) ───────────────
      const badAdmin = await call(anon, '/api/auth/login/admin', {
        method: 'POST',
        body: JSON.stringify({ email: adminEmail, password: 'buruu-nuuts-ug-12345' }),
      })
      check('Буруу нууц үгтэй админ 401 авна', badAdmin.status === 401, `status ${badAdmin.status}`)

      const badParent = await call(anon, '/api/auth/login/parent', {
        method: 'POST',
        body: JSON.stringify({ phone: parentPhone, code: 'buruu-kod' }),
      })
      check('Буруу кодтой эцэг эх 401 авна', badParent.status === 401, `status ${badParent.status}`)

      // ── 3. ЗӨВ итгэмжлэлээр АМЖИЛТТАЙ нэвтрэх ────────────────────────────
      const admin: Jar = { cookie: '' }
      const adminLogin = await call(admin, '/api/auth/login/admin', {
        method: 'POST',
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      })
      check('АМЖИЛТТАЙ админ нэвтрэлт (200)', adminLogin.status === 200, `status ${adminLogin.status}`)
      check('Сешн күүки тавигдана', admin.cookie.length > 0)

      const students = await call(admin, '/api/admin/students')
      const studentsBody = students.ok ? await students.json().catch(() => null) : null
      check('Сурагчдын жагсаалт ачаална (200)', students.status === 200, `status ${students.status}`)
      check(
        'Жагсаалт бодит өгөгдөл буцаана',
        Boolean(studentsBody) && JSON.stringify(studentsBody).includes('Тест сурагч'),
      )

      const dashboard = await call(admin, '/admin')
      check('Хяналтын самбар нээгдэнэ (200)', dashboard.status === 200, `status ${dashboard.status}`)

      const parent: Jar = { cookie: '' }
      const parentLogin = await call(parent, '/api/auth/login/parent', {
        method: 'POST',
        body: JSON.stringify({ phone: parentPhone, code: parentCode }),
      })
      check('АМЖИЛТТАЙ эцэг эхийн нэвтрэлт (200)', parentLogin.status === 200, `status ${parentLogin.status}`)

      const parentHome = await call(parent, '/parent')
      check('Эцэг эхийн нүүр нээгдэнэ (200)', parentHome.status === 200, `status ${parentHome.status}`)

      // ── 4. Эрхийн тусгаарлалт ────────────────────────────────────────────
      const crossRole = await call(parent, '/api/admin/students')
      check('Эцэг эх admin API дуудахад 403', crossRole.status === 403, `status ${crossRole.status}`)

      // ── 5. Гарах ─────────────────────────────────────────────────────────
      await call(admin, '/api/auth/logout', { method: 'POST' })
      const afterLogout = await call(admin, '/api/admin/students')
      check('Гарсны дараа хандалт хаагдана (401)', afterLogout.status === 401, `status ${afterLogout.status}`)
    }
  } finally {
    // Windows дээр `shell: true` нь cmd → node гэсэн хоёр шатлал үүсгэдэг тул
    // зөвхөн shell-ийг алахад дэд процесс (порт барьсаар) үлддэг. Модоор нь алахгүй
    // бол дараагийн ажиллуулалт EADDRINUSE болно.
    if (server.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        try {
          process.kill(-server.pid, 'SIGKILL')
        } catch {
          server.kill('SIGKILL')
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  console.log(`\n  Дүн: ${passed} амжилттай, ${failed} амжилтгүй, ${skipped.length} шалгаагүй`)
  if (skipped.length) {
    console.log('\n  Шалгаагүй зүйлсийг АМЖИЛТТАЙ гэж тооцохгүй:')
    for (const s of skipped) console.log(`    · ${s}`)
  }
  console.log('')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('\n  ✗ Шалгалт ажиллахад алдаа гарлаа:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
