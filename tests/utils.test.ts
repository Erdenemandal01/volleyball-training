import { describe, expect, it } from 'vitest'
import { normalizePhone, formatPhone } from '@/lib/phone'
import {
  addDays,
  formatDate,
  formatDateTime,
  formatMonth,
  monthRange,
  todayInUb,
  ubDateTimeToUtc,
} from '@/lib/date'
import { formatMoney } from '@/lib/format'

describe('Утасны дугаар', () => {
  it('Янз бүрийн бичлэгийг нэг хэлбэрт оруулна', () => {
    expect(normalizePhone('99112233')).toBe('99112233')
    expect(normalizePhone('+976 9911 2233')).toBe('99112233')
    expect(normalizePhone('976-9911-2233')).toBe('99112233')
    expect(normalizePhone('00976 99112233')).toBe('99112233')
    expect(normalizePhone(' 9911 2233 ')).toBe('99112233')
  })

  it('Буруу дугаарыг татгалзана', () => {
    expect(normalizePhone('1234')).toBeNull()
    expect(normalizePhone('123456789')).toBeNull()
    expect(normalizePhone('11223344')).toBeNull()
    expect(normalizePhone('abcdefgh')).toBeNull()
  })

  it('Харагдах хэлбэрт хөрвүүлнэ', () => {
    expect(formatPhone('99112233')).toBe('9911 2233')
  })
})

describe('Огноо ба цагийн бүс', () => {
  it('Огноог 2026.08.28 хэлбэрээр харуулна', () => {
    expect(formatDate('2026-08-28')).toBe('2026.08.28')
  })

  it('Date-only утга цагийн бүсээс болж шилжихгүй', () => {
    // UTC-ийн өмнөх өдрийн орой ч Улаанбаатарт дараагийн өдөр болно
    const instant = new Date('2026-08-27T16:30:00Z')
    expect(formatDateTime(instant)).toBe('2026.08.28 00:30')
    // Харин date-only мөр нь ямар ч тохиолдолд хөрвөхгүй
    expect(formatDate('2026-08-28')).toBe('2026.08.28')
  })

  it('Улаанбаатарын цагийг UTC руу зөв хөрвүүлнэ (+08:00)', () => {
    expect(ubDateTimeToUtc('2026-09-08', '17:00').toISOString()).toBe('2026-09-08T09:00:00.000Z')
  })

  it('Сарын эхлэл/төгсгөлийг зөв тооцно', () => {
    expect(monthRange(2026, 9)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthRange(2024, 2)).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('Огноо нэмэх, сарын нэр', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(formatMonth(2026, 9)).toBe('2026 оны 9 сар')
    expect(todayInUb()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('Мөнгөн дүн', () => {
  it('120,000 ₮ хэлбэрээр харуулна', () => {
    expect(formatMoney(120000)).toBe('120,000 ₮')
    expect(formatMoney(0)).toBe('0 ₮')
    expect(formatMoney(null)).toBe('—')
  })
})
