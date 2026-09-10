import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'
import fs from 'node:fs'

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) config({ path: file })
}

/** DDL/introspection-д session mode холболтыг эрхэмлэнэ (Supabase порт 5432). */
const url =
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://localhost:5432/volleyball_training'

export default {
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url,
    ssl: url.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
  },
} satisfies Config
