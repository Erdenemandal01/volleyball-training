/**
 * Supabase database password-ыг .env доторх холболтын мөрүүдэд аюулгүй бичнэ.
 *
 *   npm run db:set-password
 *
 * - Нууц үгийг гараас нууцлан асууна (дэлгэцэнд харагдахгүй).
 * - Тусгай тэмдэгтийг (@ : / ? # & % + зай г.м.) автоматаар URL-encode хийнэ.
 * - Нууц үг терминал, log, чатад хэзээ ч хэвлэгдэхгүй.
 * - DATABASE_URL болон DIRECT_DATABASE_URL хоёуланд нь нэг мөсөн бичнэ.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const ENV_PATH = path.join(process.cwd(), '.env')

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
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

/** postgresql://user:PASSWORD@host:port/db — зөвхөн нууц үгийн хэсгийг солино. */
function withPassword(url: string, encoded: string): string {
  return url.replace(
    /^(postgres(?:ql)?:\/\/[^:/@]+:)[^@]*(@)/,
    (_match, head: string, tail: string) => `${head}${encoded}${tail}`,
  )
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('\n  ✗ .env файл олдсонгүй. Эхлээд .env.example-ээс хуулна уу.\n')
    process.exit(1)
  }

  const raw = fs.readFileSync(ENV_PATH, 'utf8')
  const targets = ['DATABASE_URL', 'DIRECT_DATABASE_URL']
  const missing = targets.filter((key) => !new RegExp(`^\\s*${key}\\s*=`, 'm').test(raw))
  if (missing.length) {
    console.error(`\n  ✗ .env дотор ${missing.join(', ')} мөр байхгүй байна.\n`)
    process.exit(1)
  }

  console.log('\n  Supabase → Project Settings → Database → Database password')
  console.log('  Нууц үгээ ХУУЛААД буулгаж (paste) болно. Бичсэн тэмдэгт харагдахгүй.\n')

  const first = await askHidden('  Database password: ')
  if (!first) {
    console.error('\n  ✗ Хоосон утга. Цуцаллаа.\n')
    process.exit(1)
  }
  const second = await askHidden('  Дахин давтана уу : ')
  if (first !== second) {
    console.error('\n  ✗ Хоёр удаагийн оролт таарахгүй байна. Дахин оролдоно уу.\n')
    process.exit(1)
  }

  // URL-ийн userinfo хэсэгт аюулгүй болгож кодчилно
  const encoded = encodeURIComponent(first)
  const changedChars = first !== encoded

  let next = raw
  for (const key of targets) {
    next = next.replace(
      new RegExp(`^(\\s*${key}\\s*=\\s*)(["']?)(.*?)(\\2)\\s*$`, 'm'),
      (_m, head: string, q: string, value: string) => `${head}${q}${withPassword(value, encoded)}${q}`,
    )
  }

  if (next === raw) {
    console.error('\n  ✗ Холболтын мөрийг таньж чадсангүй. .env-ээ шалгана уу.\n')
    process.exit(1)
  }

  fs.writeFileSync(ENV_PATH, next)

  console.log('\n  ✓ Нууц үг .env доторх DATABASE_URL болон DIRECT_DATABASE_URL-д бичигдлээ.')
  console.log(`    Урт: ${first.length} тэмдэгт`)
  console.log(
    changedChars
      ? '    Тусгай тэмдэгт илэрсэн тул URL-encode хийлээ (жишээ нь @ → %40).'
      : '    Тусгай тэмдэгт байхгүй тул кодчилол шаардлагагүй байлаа.',
  )
  console.log('\n  Дараагийн алхам:  npm run db:check\n')
  process.exit(0)
}

main().catch((error) => {
  console.error('  ✗ Амжилтгүй:', error)
  process.exit(1)
})
