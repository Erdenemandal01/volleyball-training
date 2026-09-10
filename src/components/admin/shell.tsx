'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { BrandMark } from '@/components/auth-shell'
import { cx } from '@/lib/format'
import { api } from '@/lib/client-api'

const NAV = [
  { href: '/admin', label: 'Хяналтын самбар', icon: LayoutDashboard },
  { href: '/admin/students', label: 'Сурагчид', icon: Users },
  { href: '/admin/training', label: 'Бэлтгэл', icon: CalendarDays },
  { href: '/admin/attendance', label: 'Ирц', icon: ClipboardCheck },
  { href: '/admin/payments', label: 'Төлбөр', icon: Wallet },
  { href: '/admin/communication', label: 'Харилцаа', icon: MessageSquare },
]

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({
  user,
  unreadMessages,
  children,
}: {
  user: { displayName: string; email: string | null }
  unreadMessages: number
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
    setMenuOpen(false)
  }, [pathname])

  async function logout() {
    await api.post('/api/auth/logout')
    router.replace('/login')
    router.refresh()
  }

  const nav = (
    <nav className="flex flex-col gap-1 px-3" aria-label="Үндсэн цэс">
      {NAV.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors',
              active
                ? 'bg-white/12 font-medium text-white'
                : 'text-white/70 hover:bg-white/8 hover:text-white',
            )}
          >
            <Icon size={18} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.href === '/admin/communication' && unreadMessages > 0 && (
              <span className="rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[11px] font-medium text-white">
                {unreadMessages}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[var(--color-ink)] lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <BrandMark size={36} />
          <div>
            <p className="text-[15px] font-semibold text-white">Volleyball</p>
            <p className="text-[13px] text-white/60">Training</p>
          </div>
        </div>
        {nav}
        <div className="mt-auto border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
          <p className="truncate text-[13px] text-white/60">{user.email}</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Цэсийг хаах"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-[var(--color-ink)]">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-3">
                <BrandMark size={36} />
                <p className="text-[15px] font-semibold text-white">Volleyball Training</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Хаах"
                className="rounded-[10px] p-2 text-white/70 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            {nav}
            <div className="mt-auto border-t border-white/10 px-3 py-3">
              <button
                onClick={logout}
                className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                <LogOut size={18} aria-hidden />
                Гарах
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Цэс нээх"
              className="-ml-2 rounded-[10px] p-2 text-[var(--color-ink)] hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
            </button>

            <div className="min-w-0 flex-1">
              {/* Desktop дээр sidebar байршлыг харуулдаг тул давхардуулахгүй */}
              <p className="truncate text-[17px] font-semibold text-[var(--color-ink)] lg:hidden">
                {NAV.find((n) => isActive(pathname, n.href))?.label ?? 'Volleyball Training'}
              </p>
            </div>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex min-h-11 items-center gap-2 rounded-[10px] px-2 text-sm hover:bg-slate-100"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[13px] font-semibold text-[var(--color-primary)]">
                  {user.displayName.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden max-w-[160px] truncate sm:inline">{user.displayName}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-56 rounded-[12px] border border-[var(--color-line)] bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-[var(--color-line)] px-4 py-2">
                    <p className="truncate text-sm font-medium">{user.displayName}</p>
                    <p className="truncate text-[13px] text-[var(--color-muted)]">{user.email}</p>
                  </div>
                  <Link
                    href="/admin/account"
                    role="menuitem"
                    className="flex min-h-11 items-center px-4 text-sm hover:bg-slate-50"
                  >
                    Нууц үг солих
                  </Link>
                  <button
                    role="menuitem"
                    onClick={logout}
                    className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm text-[var(--color-danger)] hover:bg-slate-50"
                  >
                    <LogOut size={16} aria-hidden />
                    Гарах
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  )
}
