'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { MONTH_NAMES } from '@/lib/date'
import { cx } from '@/lib/format'

/** URL query-г шинэчлэх туслах — бусад шүүлтүүр хадгалагдана. */
export function useQueryUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const update = useCallback(
    (patch: Record<string, string | null>, options?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') params.delete(key)
        else params.set(key, value)
      }
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      startTransition(() => {
        if (options?.replace) router.replace(url, { scroll: false })
        else router.push(url, { scroll: false })
      })
    },
    [pathname, router, searchParams],
  )

  return { update, pending, searchParams }
}

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const { update, pending } = useQueryUpdater()

  const shift = (delta: number) => {
    let y = year
    let m = month + delta
    if (m < 1) {
      m = 12
      y -= 1
    }
    if (m > 12) {
      m = 1
      y += 1
    }
    update({ month: `${y}-${String(m).padStart(2, '0')}`, page: null })
  }

  return (
    <div
      className={cx(
        'inline-flex items-center rounded-[10px] border border-[var(--color-line-strong)] bg-white',
        pending && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Өмнөх сар"
        className="flex h-11 w-11 items-center justify-center rounded-l-[10px] text-[var(--color-muted)] hover:bg-slate-50"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-[128px] px-2 text-center text-sm font-medium text-[var(--color-ink)]">
        {year} оны {MONTH_NAMES[month - 1]}
      </span>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Дараагийн сар"
        className="flex h-11 w-11 items-center justify-center rounded-r-[10px] text-[var(--color-muted)] hover:bg-slate-50"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

export function SelectFilter({
  label,
  name,
  value,
  options,
  allLabel = 'Бүгд',
}: {
  label: string
  name: string
  value: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  const { update } = useQueryUpdater()
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        className="vt-input min-w-[150px] py-2 text-sm"
        value={value}
        aria-label={label}
        onChange={(e) => update({ [name]: e.target.value || null, page: null })}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SearchFilter({
  name = 'q',
  placeholder = 'Хайх…',
  defaultValue = '',
}: {
  name?: string
  placeholder?: string
  defaultValue?: string
}) {
  const { update } = useQueryUpdater()
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value !== defaultValue) update({ [name]: value || null, page: null }, { replace: true })
    }, 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative min-w-[200px] flex-1">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]"
        aria-hidden
      />
      <input
        type="search"
        className="vt-input pl-9 text-sm"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}

export function Pagination({
  page,
  pageCount,
  total,
}: {
  page: number
  pageCount: number
  total: number
}) {
  const { update } = useQueryUpdater()
  if (pageCount <= 1) {
    return (
      <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Нийт {total} бичлэг</p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm text-[var(--color-muted)]">
        Нийт {total} бичлэг · {page} / {pageCount} хуудас
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => update({ page: String(page - 1) })}
          className="min-h-11 rounded-[10px] border border-[var(--color-line-strong)] px-3 text-sm disabled:opacity-50"
        >
          Өмнөх
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => update({ page: String(page + 1) })}
          className="min-h-11 rounded-[10px] border border-[var(--color-line-strong)] px-3 text-sm disabled:opacity-50"
        >
          Дараах
        </button>
      </div>
    </div>
  )
}
