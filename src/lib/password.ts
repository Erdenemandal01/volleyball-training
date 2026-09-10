import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const BCRYPT_ROUNDS = 10

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS)
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(secret, hash)
  } catch {
    return false
  }
}

/** Эцэг эхэд өгөх санамсаргүй 6 оронтой түр код */
export function generateTempCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000))
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET тохируулаагүй эсвэл хэт богино байна (32+ тэмдэгт шаардлагатай). ' +
        '.env файлаа шалгана уу.',
    )
  }
  return secret
}

/**
 * Session token-ыг өгөгдлийн санд хадгалахын өмнө HMAC хийнэ.
 * Зөвхөн hash хадгалахаас илүү: DB задарсан ч SESSION_SECRET-гүйгээр
 * хүчинтэй token-ы утгыг тааруулах боломжгүй.
 */
export function hmacToken(value: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex')
}
