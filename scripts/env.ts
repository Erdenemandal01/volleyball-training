import { config } from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'

const root = process.cwd()
for (const file of ['.env.local', '.env']) {
  const full = path.join(root, file)
  if (fs.existsSync(full)) config({ path: full })
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`\n  ✗ ${name} тохируулаагүй байна. .env файлаа шалгана уу.\n`)
    process.exit(1)
  }
  return value
}

/** DDL/migration-д session mode холболтыг эрхэмлэнэ. */
export function migrationUrl(): string {
  return process.env.DIRECT_DATABASE_URL || requireEnv('DATABASE_URL')
}

export function appUrl(): string {
  return requireEnv('DATABASE_URL')
}
