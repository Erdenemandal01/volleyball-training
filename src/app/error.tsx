'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="vt-card w-full max-w-md px-6 py-8 text-center">
        <h1 className="text-lg font-semibold">Алдаа гарлаа</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу. Асуудал давтагдвал админд мэдэгдэнэ үү.
        </p>
        <button
          onClick={reset}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-[var(--color-primary)] px-4 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Дахин оролдох
        </button>
      </div>
    </main>
  )
}
