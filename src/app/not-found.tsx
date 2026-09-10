import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="vt-card w-full max-w-md px-6 py-8 text-center">
        <p className="text-4xl font-bold text-[var(--color-ink)]">404</p>
        <h1 className="mt-2 text-lg font-semibold">Хуудас олдсонгүй</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Хаяг буруу байна, эсвэл танд энэ мэдээллийг үзэх эрх байхгүй байна.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[var(--color-primary)] px-4 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Нүүр хуудас руу буцах
        </Link>
      </div>
    </main>
  )
}
