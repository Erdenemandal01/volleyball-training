/**
 * Монгол утасны дугаарыг нэг хэлбэрт оруулна.
 * "+976 9911 2233", "976-99112233", "99112233" → "99112233"
 */
export function normalizePhone(input: string): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  digits = digits.replace(/^\+/, '')
  if (digits.startsWith('00976')) digits = digits.slice(5)
  else if (digits.startsWith('976') && digits.length === 11) digits = digits.slice(3)

  if (!/^\d{8}$/.test(digits)) return null
  // Монголын гар утас/суурин дугаар 5-9-өөр эхэлнэ
  if (!/^[5-9]/.test(digits)) return null
  return digits
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}

/** "99112233" → "9911 2233" */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 8) return phone
  return `${digits.slice(0, 4)} ${digits.slice(4)}`
}
