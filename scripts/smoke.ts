/**
 * Ажиллаж буй серверийн эсрэг үндсэн урсгалын шалгалт (unit тестээс тусдаа).
 *
 *   npx tsx scripts/smoke.ts --base=http://localhost:3000 \
 *     --admin-email=... --admin-password=... --parent-phone=... --parent-code=...
 *
 * Зөвхөн УНШИХ ба нэвтрэх шалгалт хийнэ — өгөгдөл өөрчлөхгүй.
 * Production дээр ажиллуулж болно.
 */
import './env'

function arg(name: string, fallback = ''): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : fallback
}

const base = arg('base', 'http://localhost:3000').replace(/\/$/, '')

type Jar = { cookie: string }

async function call(jar: Jar, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(jar.cookie ? { Cookie: jar.cookie } : {}),
      ...(init.headers ?? {}),
    },
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    const pair = setCookie.split(';')[0]
    jar.cookie = pair
  }
  return response
}

let passed = 0
let failed = 0
/** Шалгаж ЧАДААГҮЙ зүйлсийг амжилттай гэж тооцохгүй, тусад нь жагсаана. */
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

async function main() {
  console.log(`\n  Шалгаж буй хаяг: ${base}\n`)

  const anon: Jar = { cookie: '' }

  // 1. Нэвтрээгүй хэрэглэгч хамгаалалттай хуудсанд хандах
  const guard = await call(anon, '/admin')
  check(
    'Нэвтрээгүй үед /admin хаагдана',
    guard.status === 307 || guard.status === 302 || guard.status === 401,
    `status ${guard.status}`,
  )

  const guardApi = await call(anon, '/api/admin/students')
  check('Нэвтрээгүй үед admin API 401 буцаана', guardApi.status === 401, `status ${guardApi.status}`)

  // 2. Буруу нэвтрэлт мэдээлэл задруулахгүй
  const badLogin = await call(anon, '/api/auth/login/parent', {
    method: 'POST',
    body: JSON.stringify({ phone: '99999999', code: 'wrong-code' }),
  })
  const badBody = await badLogin.json().catch(() => ({}))
  check(
    'Буруу нэвтрэлт 401 + ерөнхий мэдэгдэл',
    badLogin.status === 401 && !JSON.stringify(badBody).includes('олдсонгүй'),
    `status ${badLogin.status}`,
  )

  // 3. Админ нэвтрэлт (сонголтоор)
  const adminEmail = arg('admin-email', process.env.SMOKE_ADMIN_EMAIL ?? '')
  const adminPassword = arg('admin-password', process.env.SMOKE_ADMIN_PASSWORD ?? '')
  if (adminEmail && adminPassword) {
    const admin: Jar = { cookie: '' }
    const login = await call(admin, '/api/auth/login/admin', {
      method: 'POST',
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    })
    check('Админ нэвтэрнэ', login.status === 200, `status ${login.status}`)

    const dashboard = await call(admin, '/admin')
    check('Хяналтын самбар нээгдэнэ', dashboard.status === 200, `status ${dashboard.status}`)

    const students = await call(admin, '/api/admin/students')
    check('Сурагчдын жагсаалт ачаална', students.status === 200, `status ${students.status}`)

    await call(admin, '/api/auth/logout', { method: 'POST' })
    const afterLogout = await call(admin, '/api/admin/students')
    check('Гарсны дараа хандалт хаагдана', afterLogout.status === 401, `status ${afterLogout.status}`)
  } else {
    skip('Админаар АМЖИЛТТАЙ нэвтрэх', '--admin-email / --admin-password өгөөгүй')
  }

  // 4. Эцэг эхийн нэвтрэлт (сонголтоор)
  const parentPhone = arg('parent-phone', process.env.SMOKE_PARENT_PHONE ?? '')
  const parentCode = arg('parent-code', process.env.SMOKE_PARENT_CODE ?? '')
  if (parentPhone && parentCode) {
    const parent: Jar = { cookie: '' }
    const login = await call(parent, '/api/auth/login/parent', {
      method: 'POST',
      body: JSON.stringify({ phone: parentPhone, code: parentCode }),
    })
    check('Эцэг эх нэвтэрнэ', login.status === 200, `status ${login.status}`)

    const home = await call(parent, '/parent')
    check('Эцэг эхийн нүүр нээгдэнэ', home.status === 200, `status ${home.status}`)

    const adminBlocked = await call(parent, '/api/admin/students')
    check(
      'Эцэг эх admin API дуудахад 403',
      adminBlocked.status === 403,
      `status ${adminBlocked.status}`,
    )

    const foreign = await call(parent, '/parent?child=00000000-0000-0000-0000-000000000000')
    check('Танихгүй хүүхдийн ID 404 буцаана', foreign.status === 404, `status ${foreign.status}`)
  } else {
    skip('Эцэг эхээр АМЖИЛТТАЙ нэвтрэх', '--parent-phone / --parent-code өгөөгүй')
  }

  console.log(
    `\n  Дүн: ${passed} амжилттай, ${failed} амжилтгүй, ${skipped.length} шалгаагүй`,
  )
  if (skipped.length > 0) {
    console.log('\n  Шалгаагүй зүйлсийг АМЖИЛТТАЙ гэж тооцохгүй:')
    for (const item of skipped) console.log(`    · ${item}`)
  }
  console.log('')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('  ✗ Шалгалт ажиллахад алдаа гарлаа:', error)
  process.exit(1)
})
