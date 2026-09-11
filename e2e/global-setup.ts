import fs from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { isLocalTarget } from '../scripts/guard'

/**
 * E2E тестүүд өгөгдөл ҮҮСГЭЖ, ӨӨРЧИЛДӨГ. Тиймээс production (алсын)
 * өгөгдлийн сан руу заасан үед ажиллахаас татгалзана.
 */
export default function globalSetup() {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file)
    if (fs.existsSync(full)) config({ path: full })
  }

  const url = process.env.DATABASE_URL ?? ''
  if (!url) return
  if (isLocalTarget(url) || process.env.E2E_ALLOW_REMOTE === 'true') return

  const masked = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
  throw new Error(
    '\n\n  ✗ E2E тестүүд өгөгдөл өөрчилдөг тул АЛСЫН өгөгдлийн сан дээр ажиллуулахыг хориглолоо.\n' +
      `    DATABASE_URL: ${masked}\n\n` +
      '    Тусгаарласан орчинд ажиллуулна уу, жишээ нь:\n' +
      '      DATABASE_URL="pglite://./.pglite" npx next dev -p 3100\n' +
      '      E2E_BASE_URL=http://localhost:3100 npm run e2e\n\n' +
      '    (Үнэхээр санаатай бол E2E_ALLOW_REMOTE=true)\n',
  )
}
