/**
 * Тусгаарласан локал PostgreSQL 17 cluster-ийг удирдана (тестэд зориулсан).
 *
 *   npm run testpg:cluster -- up      # үүсгэж асаана (байвал зүгээр асаана)
 *   npm run testpg:cluster -- status  # төлөв
 *   npm run testpg:cluster -- down    # унтраана
 *   npm run testpg:cluster -- destroy # унтрааж, өгөгдлийн хавтсыг устгана
 *
 * Яагаад тусдаа cluster вэ:
 *   • PGlite бол WASM дээрх PostgreSQL — эрхийн зан төлөв, дүрийн систем нь
 *     жинхэнэ сервертэй бүрэн ижил гэсэн баталгаа байхгүй. Эрхийн migration-ыг
 *     ЖИНХЭНЭ PostgreSQL дээр шалгах ёстой.
 *   • Хэрэглэгчийн өөрийн 5432 порт дээрх серверийг хөндөхгүй — өөр порт,
 *     өөр өгөгдлийн хавтас, trust auth (нууц үг хэрэггүй).
 *   • Docker шаардахгүй — PostgreSQL-ийн суусан binary-г шууд ашиглана.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.TESTPG_PORT ?? 55432)
const ROOT =
  process.env.TESTPG_ROOT ?? path.join(os.tmpdir(), 'volleyball-testpg')
const DATA = path.join(ROOT, 'data')
const LOGFILE = path.join(ROOT, 'pg.log')

function findBinDir(): string {
  if (process.env.TESTPG_BIN) return process.env.TESTPG_BIN
  const candidates = [
    ...(process.platform === 'win32'
      ? ['C:/Program Files/PostgreSQL/17/bin', 'C:/Program Files/PostgreSQL/16/bin']
      : []),
    '/usr/lib/postgresql/17/bin',
    '/usr/lib/postgresql/16/bin',
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, process.platform === 'win32' ? 'initdb.exe' : 'initdb'))) {
      return dir
    }
  }
  // PATH дээр байж магадгүй
  const probe = spawnSync('initdb', ['--version'], { encoding: 'utf8' })
  if (probe.status === 0) return ''
  throw new Error(
    'PostgreSQL-ийн binary олдсонгүй. TESTPG_BIN орчны хувьсагчаар замыг заана уу ' +
      '(жишээ: TESTPG_BIN="C:/Program Files/PostgreSQL/17/bin").',
  )
}

const BIN = findBinDir()
const exe = (name: string) =>
  BIN ? path.join(BIN, process.platform === 'win32' ? `${name}.exe` : name) : name

function isRunning(): boolean {
  const r = spawnSync(exe('pg_isready'), ['-h', '127.0.0.1', '-p', String(PORT)], {
    encoding: 'utf8',
  })
  return r.status === 0
}

function up() {
  if (isRunning()) {
    console.log(`  ✓ Cluster аль хэдийн ажиллаж байна (порт ${PORT})`)
    return
  }
  if (!fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
    fs.mkdirSync(ROOT, { recursive: true })
    console.log(`  → initdb: ${DATA}`)
    execFileSync(
      exe('initdb'),
      ['-D', DATA, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '-E', 'UTF8', '--locale=C'],
      { stdio: 'ignore' },
    )
  }
  console.log(`  → Асааж байна (порт ${PORT})`)
  spawnSync(
    exe('pg_ctl'),
    ['-D', DATA, '-l', LOGFILE, '-o', `-p ${PORT} -c listen_addresses=127.0.0.1`, 'start'],
    { stdio: 'ignore', timeout: 30_000 },
  )
  // pg_ctl заримдаа лог handle-аа барьж удирдлагаа буцаахгүй тул өөрсдөө хүлээнэ
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (isRunning()) {
      console.log(`  ✓ Бэлэн: postgresql://postgres@127.0.0.1:${PORT}/postgres`)
      return
    }
  }
  throw new Error(`Cluster асаагүй. Лог: ${LOGFILE}`)
}

function down() {
  if (!isRunning()) {
    console.log('  • Cluster ажиллахгүй байна')
    return
  }
  spawnSync(exe('pg_ctl'), ['-D', DATA, 'stop', '-m', 'fast'], { stdio: 'ignore', timeout: 30_000 })
  console.log('  ✓ Унтраалаа')
}

function destroy() {
  down()
  if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true, force: true })
    console.log(`  ✓ Устгалаа: ${ROOT}`)
  }
}

function status() {
  console.log(`  Хавтас : ${DATA}`)
  console.log(`  Порт   : ${PORT}`)
  console.log(`  Төлөв  : ${isRunning() ? 'ажиллаж байна' : 'унтарсан'}`)
  if (BIN) console.log(`  Binary : ${BIN}`)
}

const command = process.argv[2] ?? 'status'
try {
  if (command === 'up') up()
  else if (command === 'down') down()
  else if (command === 'destroy') destroy()
  else if (command === 'status') status()
  else {
    console.error('Хэрэглээ: testpg:cluster -- <up|down|destroy|status>')
    process.exit(1)
  }
} catch (error) {
  console.error('  ✗', error instanceof Error ? error.message : error)
  process.exit(1)
}
