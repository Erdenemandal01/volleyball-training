export function PageHeader({
  title,
  description,
  filters,
  action,
}: {
  title: string
  description?: string
  filters?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
          )}
        </div>
        {action}
      </div>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  )
}
