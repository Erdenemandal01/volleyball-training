'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SessionFormModal } from './session-form'
import { api } from '@/lib/client-api'
import { formatDate, formatTime } from '@/lib/date'

export function SessionActions({
  session,
  groups,
  hasAttendance,
  rosterCount,
  markedCount,
  presentCount,
  historyCount,
}: {
  session: {
    id: string
    groupId: string
    groupName: string
    date: string
    startTime: string
    endTime: string
    location: string
    note: string
    status: 'planned' | 'completed' | 'cancelled'
  }
  groups: { id: string; name: string }[]
  hasAttendance: boolean
  rosterCount: number
  markedCount: number
  presentCount: number
  historyCount: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const cancelled = session.status === 'cancelled'

  /** Бэлтгэлийг бүрэн тодорхойлох тэмдэглэгээ — нэг өдөрт олон бэлтгэл байж болно */
  const sessionLabel = `${formatDate(session.date)} · ${session.groupName} · ${formatTime(session.startTime)}`

  const deleteBlockedReason = hasAttendance ? 'Ирц бүртгэгдсэн тул устгах боломжгүй.' : null
  const deletable = deleteBlockedReason === null

  async function syncRoster() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await api.post<{ added: number }>(
        `/api/admin/sessions/${session.id}/roster-sync`,
      )
      setSyncMessage(
        result.added > 0
          ? `${result.added} шинэ сурагч жагсаалтад нэмэгдлээ.`
          : 'Нэмэх шинэ сурагч байхгүй байна.',
      )
      router.refresh()
    } catch {
      setSyncMessage('Жагсаалтыг шинэчилж чадсангүй.')
    } finally {
      setSyncing(false)
    }
  }

  async function toggleCompleted() {
    await api.post(`/api/admin/sessions/${session.id}/status`, {
      status: session.status === 'completed' ? 'planned' : 'completed',
    })
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {!cancelled && (
          <>
            <Button size="md" variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} aria-hidden />
              Засах
            </Button>
            {session.status === 'planned' && (
              <Button size="md" variant="secondary" onClick={syncRoster} loading={syncing}>
                <RefreshCw size={16} aria-hidden />
                Жагсаалт шинэчлэх
              </Button>
            )}
            <Button size="md" variant="secondary" onClick={toggleCompleted}>
              <CheckCircle2 size={16} aria-hidden />
              {session.status === 'completed' ? 'Төлөвлөсөн болгох' : 'Дууссан болгох'}
            </Button>
            <Button size="md" variant="danger" onClick={() => setCancelOpen(true)}>
              <XCircle size={16} aria-hidden />
              Цуцлах
            </Button>
            {/* Ирцтэй үед нуухгүй — яагаад боломжгүйг нь тайлбарлаж идэвхгүй болгоно */}
            <Button
              size="md"
              variant="secondary"
              disabled={!deletable}
              title={deleteBlockedReason ?? undefined}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} aria-hidden />
              Устгах
            </Button>
          </>
        )}
      </div>

      {!cancelled && deleteBlockedReason && (
        <p className="max-w-sm text-right text-[13px] text-[var(--color-muted)]">
          {deleteBlockedReason} <strong>Цуцлах</strong> үйлдэл нь ашигласан оролтын эрхийг
          буцааж, түүхийг хадгална.
        </p>
      )}

      {syncMessage && <p className="text-[13px] text-[var(--color-muted)]">{syncMessage}</p>}

      {editOpen && (
        <SessionFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          groups={groups}
          mode="edit"
          sessionId={session.id}
          initialValues={{
            groupId: session.groupId,
            date: session.date,
            startTime: session.startTime,
            endTime: session.endTime,
            location: session.location,
            note: session.note,
          }}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Бэлтгэл цуцлах"
        danger
        confirmLabel="Бэлтгэлийг цуцлах"
        reasonLabel="Цуцлах шалтгаан"
        reasonRequired
        message={
          <>
            <strong>{sessionLabel}</strong> — энэ бэлтгэл цуцлагдана.{' '}
            {presentCount > 0 ? (
              <>
                Бүртгэсэн <strong>{markedCount}</strong> ирцээс <strong>{presentCount}</strong>{' '}
                сурагчийн оролтын эрх буцаагдана. Ирцийн түүх хадгалагдана.
              </>
            ) : markedCount > 0 ? (
              <>
                Бүртгэсэн <strong>{markedCount}</strong> ирц байгаа ч эрх ашигласан бүртгэл
                байхгүй тул эрхийн өөрчлөлт гарахгүй.
              </>
            ) : (
              <>Ирц бүртгэгдээгүй тул эрхийн өөрчлөлт гарахгүй.</>
            )}{' '}
            Цуцалсны дараа энэ бэлтгэлд ирц бүртгэх боломжгүй болно (жагсаалтад {rosterCount}{' '}
            сурагч).
          </>
        }
        onConfirm={async (reason) => {
          await api.post(`/api/admin/sessions/${session.id}/cancel`, { reason })
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Бэлтгэл устгах"
        danger
        confirmLabel="Бэлтгэлийг устгах"
        message={
          <>
            <strong>{sessionLabel}</strong> — энэ бэлтгэл бүрмөсөн устана. Ирц бүртгэгдээгүй тул
            хэн нэгний оролтын эрхэд нөлөөлөхгүй. Энэ үйлдлийг буцаах боломжгүй.
            {historyCount > 0 && (
              <>
                {' '}Өмнө бүртгэж байгаад буцаасан <strong>{historyCount}</strong> тэмдэглэл
                байна — устгахын өмнө audit бүртгэлд хуулагдана.
              </>
            )}
          </>
        }
        onConfirm={async () => {
          await api.del(`/api/admin/sessions/${session.id}`)
          // Админы байсан сар/бүлгийн шүүлтүүрийг хадгалж буцна
          const query = searchParams.toString()
          router.push(query ? `/admin/training?${query}` : '/admin/training')
          router.refresh()
        }}
      />
    </div>
  )
}
