'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Home, MessageSquare, User } from 'lucide-react'
import { BrandMark } from '@/components/auth-shell'
import { cx } from '@/lib/format'

export type ChildOption = {
  id: string
  fullName: string
  groupName: string | null
  status: 'active' | 'inactive'
}

const NAV = [
  { href: '/parent', label: 'Нүүр', icon: Home },
  { href: '/parent/schedule', label: 'Хуваарь', icon: CalendarDays },
  { href: '/parent/messages', label: 'Харилцаа', icon: MessageSquare },
  { href: '/parent/profile', label: 'Профайл', icon: User },
]

export function ParentShell({
  children,
  childOptions,
  unreadCount,
  displayName,
}: {
  children: React.ReactNode
  childOptions: ChildOption[]
  unreadCount: number
  displayName: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeChildId = searchParams.get('child') ?? childOptions[0]?.id ?? null

  function hrefWithChild(href: string) {
    if (!activeChildId) return href
    return `${href}?child=${activeChildId}`
  }

  function selectChild(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('child', id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-canvas)]">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <BrandMark size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[var(--color-ink)]">
              Volleyball Training
            </p>
            <p className="truncate text-[13px] text-[var(--color-muted)]">{displayName}</p>
          </div>
        </div>

        {childOptions.length > 1 && (
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <div
              role="tablist"
              aria-label="Хүүхэд сонгох"
              className="vt-scroll-x flex gap-2 rounded-[12px] bg-slate-100 p-1"
            >
              {childOptions.map((child) => (
                <button
                  key={child.id}
                  role="tab"
                  type="button"
                  aria-selected={child.id === activeChildId}
                  onClick={() => selectChild(child.id)}
                  className={cx(
                    'min-h-11 flex-1 whitespace-nowrap rounded-[10px] px-3 text-sm font-medium transition-colors',
                    child.id === activeChildId
                      ? 'bg-white text-[var(--color-ink)] shadow-sm'
                      : 'text-[var(--color-muted)]',
                  )}
                >
                  {child.fullName}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24">{children}</main>

      <nav
        aria-label="Үндсэн цэс"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] bg-white"
      >
        <div className="mx-auto flex max-w-3xl">
          {NAV.map((item) => {
            const Icon = item.icon
            const active =
              item.href === '/parent' ? pathname === '/parent' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={hrefWithChild(item.href)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-[12px]',
                  active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]',
                )}
              >
                <Icon size={22} aria-hidden />
                {item.label}
                {item.href === '/parent/messages' && unreadCount > 0 && (
                  <span className="absolute right-1/2 top-2 translate-x-3 rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
