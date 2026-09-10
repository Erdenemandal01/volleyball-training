import Link from 'next/link'
import { ChevronLeft, Layers } from 'lucide-react'
import { listGroups } from '@/lib/services/groups'
import { Badge, Card, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { AddGroupButton, EditGroupButton } from '@/components/admin/group-form'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const groups = await listGroups()

  return (
    <>
      <Link
        href="/admin/training"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ChevronLeft size={16} aria-hidden />
        Бэлтгэл рүү буцах
      </Link>

      <PageHeader
        title="Сургалтын бүлгүүд"
        description="Сурагч нэг идэвхтэй бүлэгт харьяалагдана. Бүлэг солих түүх хадгалагдана."
        action={<AddGroupButton />}
      />

      <Card>
        {groups.length === 0 ? (
          <EmptyState
            icon={<Layers size={28} />}
            title="Бүлэг байхгүй байна"
            description="Эхний сургалтын бүлгээ үүсгэнэ үү."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--color-ink)]">{group.name}</p>
                    {group.isActive ? (
                      <Badge tone="success">Идэвхтэй</Badge>
                    ) : (
                      <Badge tone="neutral">Идэвхгүй</Badge>
                    )}
                  </div>
                  {group.description && (
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">{group.description}</p>
                  )}
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                    Идэвхтэй сурагч: <span className="tabular-nums">{group.studentCount}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/students?group=${group.id}`}
                    className="inline-flex min-h-9 items-center rounded-[10px] border border-[var(--color-line-strong)] px-3 text-sm hover:bg-slate-50"
                  >
                    Сурагчид
                  </Link>
                  <EditGroupButton
                    group={{
                      id: group.id,
                      name: group.name,
                      description: group.description ?? '',
                      isActive: group.isActive,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
