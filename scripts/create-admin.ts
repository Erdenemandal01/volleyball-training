/**
 * Анхны админ үүсгэх (нийтэд нээлттэй admin registration байхгүй).
 *
 *   npm run create-admin -- --email=admin@example.com --name="Админ"
 *
 * Нууц үгийг гараас нууцлан асууж, давтуулж шалгана.
 * CI/скриптэд ADMIN_PASSWORD орчны хувьсагчаар өгч болно.
 * Нууц үг терминал, log, өгөгдлийн санд ил хэлбэрээр хэзээ ч бичигдэхгүй (зөвхөн bcrypt hash).
 */
import './env'
import readline from 'node:readline'
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { hashSecret } from '../src/lib/password'

const MIN_LENGTH = 10

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found?.split('=').slice(1).join('=')
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          'Интерактив терминал шаардлагатай. Терминалаасаа шууд ажиллуулна уу, ' +
            'эсвэл ADMIN_PASSWORD орчны хувьсагчаар дамжуулна уу.',
        ),
      )
      return
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void }
    let first = true
    rlAny._writeToOutput = (s: string) => {
      if (first) {
        process.stdout.write(s)
        first = false
      }
    }
    rl.question(question, (answer) => {
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

/** Сул нууц үгийг сануулна (хориглохгүй, зөвхөн анхааруулна). */
function weaknesses(password: string): string[] {
  const notes: string[] = []
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) notes.push('том/жижиг үсэг холих')
  if (!/\d/.test(password)) notes.push('тоо нэмэх')
  if (!/[^A-Za-z0-9]/.test(password)) notes.push('тусгай тэмдэгт нэмэх')
  if (password.length < 14) notes.push('14+ тэмдэгт болгох')
  return notes
}

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const name = arg('name') ?? process.env.ADMIN_NAME ?? 'Админ'

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    console.error('\n  ✗ И-мэйл буруу байна. --email=admin@example.com гэж дамжуулна уу.\n')
    process.exit(1)
  }

  const target = process.env.DATABASE_URL ?? ''
  if (target.includes('[YOUR-PASSWORD]')) {
    console.error('\n  ✗ DATABASE_URL дотор нууц үг орлуулагдаагүй байна (npm run db:set-password).\n')
    process.exit(1)
  }

  console.log('\n  Өгөгдлийн сан : ' + maskUrl(target))
  console.log('  И-мэйл        : ' + email)
  console.log('  Нэр           : ' + name)

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length) {
    console.log('\n  ⚠ Энэ и-мэйлтэй бүртгэл аль хэдийн байна — нууц үгийг нь ШИНЭЧЛЭНЭ.')
  } else {
    console.log('\n  → Шинэ админ үүсгэнэ.')
  }
  console.log('')

  let password = process.env.ADMIN_PASSWORD ?? ''
  if (password) {
    console.log('  • Нууц үгийг ADMIN_PASSWORD орчны хувьсагчаас авлаа.')
  } else {
    password = await askHidden(`  Админы нууц үг (${MIN_LENGTH}+ тэмдэгт): `)
    if (password.length < MIN_LENGTH) {
      console.error(`\n  ✗ Нууц үг дор хаяж ${MIN_LENGTH} тэмдэгт байх ёстой. Цуцаллаа.\n`)
      process.exit(1)
    }
    const again = await askHidden('  Дахин давтана уу              : ')
    if (password !== again) {
      console.error('\n  ✗ Хоёр удаагийн оролт таарахгүй байна. Цуцаллаа.\n')
      process.exit(1)
    }
  }

  if (password.length < MIN_LENGTH) {
    console.error(`\n  ✗ Нууц үг дор хаяж ${MIN_LENGTH} тэмдэгт байх ёстой.\n`)
    process.exit(1)
  }

  const notes = weaknesses(password)
  const passwordHash = await hashSecret(password)

  if (existing.length) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'admin',
        isActive: true,
        displayName: name,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id))
    console.log(`\n  ✓ Админы нууц үг шинэчлэгдлээ: ${email}`)
  } else {
    await db.insert(users).values({ role: 'admin', email, displayName: name, passwordHash })
    console.log(`\n  ✓ Админ үүслээ: ${email}`)
  }

  const counts = await db
    .select({
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      parents: sql<number>`count(*) filter (where ${users.role} = 'parent')::int`,
    })
    .from(users)
  console.log(`    Нийт админ: ${counts[0].admins} · эцэг эх: ${counts[0].parents}`)

  if (notes.length) {
    console.log(`\n  ⚠ Нууц үгийг илүү хүчтэй болговол зохимжтой: ${notes.join(', ')}.`)
  }
  console.log('\n  Нэвтрэх:  /admin/login\n')
  process.exit(0)
}

main().catch((error) => {
  console.error('\n  ✗ Амжилтгүй:', error instanceof Error ? error.message : error, '\n')
  process.exit(1)
})
