/** 120000 → "120,000 ₮" */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  return `${new Intl.NumberFormat('en-US').format(amount)} ₮`
}

/** 120000 → "120,000" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
