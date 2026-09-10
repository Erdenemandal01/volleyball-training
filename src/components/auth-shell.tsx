import Link from 'next/link'

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-primary)] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      VT
    </span>
  )
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-canvas)]">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="text-lg font-semibold text-[var(--color-ink)]">Volleyball Training</p>
              <p className="text-sm text-[var(--color-muted)]">Сургалтын удирдлагын систем</p>
            </div>
          </div>

          <div className="vt-card px-5 py-6 sm:px-6">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>

          {footer && <div className="mt-4 text-center text-sm">{footer}</div>}
        </div>
      </div>
      <footer className="px-4 pb-6 text-center text-[13px] text-[var(--color-faint)]">
        <Link href="/login" className="hover:underline">
          Эцэг эхийн нэвтрэлт
        </Link>
        <span className="mx-2">·</span>
        <Link href="/admin/login" className="hover:underline">
          Админ нэвтрэлт
        </Link>
      </footer>
    </main>
  )
}
