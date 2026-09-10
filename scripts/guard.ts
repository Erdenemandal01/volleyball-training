/**
 * Аюултай командуудыг алсын (managed) өгөгдлийн сан дээр санамсаргүй
 * ажиллуулахаас сэргийлнэ. NODE_ENV-д найдахгүй — холболтын хаягаар шийднэ.
 */
const REMOTE_HINTS = [
  'supabase.co',
  'supabase.com',
  'neon.tech',
  'rds.amazonaws.com',
  'render.com',
  'railway.app',
  'planetscale',
  'azure.com',
  'digitalocean.com',
]

export function isLocalTarget(url: string): boolean {
  if (url.startsWith('pglite:')) return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
    if (host.endsWith('.local')) return true
    return false
  } catch {
    return false
  }
}

export function isKnownRemote(url: string): boolean {
  const lower = url.toLowerCase()
  return REMOTE_HINTS.some((hint) => lower.includes(hint))
}

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:****@')
}

/**
 * Өгөгдөл устгах/зохиомол өгөгдөл нэмэх командыг хамгаална.
 * Алсын сан руу чиглэсэн бол --allow-remote тугтай, гараар баталгаажуулахыг шаардана.
 */
export function assertSafeTarget(url: string, action: string) {
  if (isLocalTarget(url)) return

  const allow = process.argv.includes('--allow-remote')
  const label = isKnownRemote(url) ? 'АЛСЫН (managed) ' : 'алсын '

  if (!allow) {
    console.error(`\n  ✗ "${action}" командыг ${label}өгөгдлийн сан дээр ажиллуулахыг хориглолоо.`)
    console.error(`    Хаяг: ${maskUrl(url)}`)
    console.error('\n    Энэ нь production өгөгдөл байж магадгүй. Хэрэв ҮНЭХЭЭР санаатай бол:')
    console.error(`      npm run ${action} -- --yes --allow-remote\n`)
    process.exit(1)
  }

  console.warn(`\n  ⚠ АНХААР: "${action}" нь ${label}сан дээр ажиллаж байна: ${maskUrl(url)}\n`)
}
