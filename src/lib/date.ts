export const TIME_ZONE = 'Asia/Ulaanbaatar'

const isoDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const isoTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Улаанбаатарын цагаар өнөөдрийн огноо — "2026-09-08" */
export function todayInUb(now: Date = new Date()): string {
  return isoDateFormatter.format(now)
}

/** Улаанбаатарын цагаар одоогийн цаг — "14:30" */
export function nowTimeInUb(now: Date = new Date()): string {
  return isoTimeFormatter.format(now)
}

/** Тухайн агшинд Улаанбаатарын UTC-ээс хазайлт (минут). */
function ubOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(at)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+08:00'
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
  if (!match) return 480
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
}

/**
 * "2026-09-08" + "18:00" → яг тэр агшны UTC Date.
 * Date-only талбарууд цагийн бүсээс болж хөрвөхгүй байхын тулд гараар тооцно.
 */
export function ubDateTimeToUtc(dateStr: string, timeStr = '00:00'): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
  const guess = new Date(naive)
  const offset = ubOffsetMinutes(guess)
  return new Date(naive - offset * 60_000)
}

/** "2026-09-08" → "2026.09.08" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const iso = typeof value === 'string' ? value.slice(0, 10) : isoDateFormatter.format(value)
  return iso.replaceAll('-', '.')
}

/** "2026-09-08" → "09.08" (хүснэгтийн багана) */
export function formatDayShort(value: string): string {
  return value.slice(5).replaceAll('-', '.')
}

/** "18:00:00" → "18:00" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 5)
}

/** UTC timestamp → "2026.09.08 14:30" (Улаанбаатарын цагаар) */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return `${isoDateFormatter.format(date).replaceAll('-', '.')} ${isoTimeFormatter.format(date)}`
}

export const MONTH_NAMES = [
  '1 сар',
  '2 сар',
  '3 сар',
  '4 сар',
  '5 сар',
  '6 сар',
  '7 сар',
  '8 сар',
  '9 сар',
  '10 сар',
  '11 сар',
  '12 сар',
]

export const WEEKDAY_SHORT = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя']

/** (2026, 9) → "2026 оны 9 сар" */
export function formatMonth(year: number, month: number): string {
  return `${year} оны ${month} сар`
}

/** (2026, 9) → "2026 оны 9 сарын" */
export function formatMonthOf(year: number, month: number): string {
  return `${year} оны ${month} сарын`
}

/** (2026, 9) → "2026 оны 9 сард" */
export function formatMonthIn(year: number, month: number): string {
  return `${year} оны ${month} сард`
}

/** "2026-09" → { year, month } */
export function parseMonthKey(key: string | null | undefined, fallback?: Date) {
  const base = todayInUb(fallback ?? new Date())
  const value = key && /^\d{4}-\d{2}$/.test(key) ? key : base.slice(0, 7)
  const [year, month] = value.split('-').map(Number)
  return { year, month, key: value }
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Огнооны мөрнөөс 7 хоногийн өдрийн индекс (0=Ня) */
export function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
