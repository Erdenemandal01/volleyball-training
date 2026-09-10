'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PaymentFormModal } from './payment-form'
import { api } from '@/lib/client-api'
import { MONTH_NAMES } from '@/lib/date'
import { formatMoney } from '@/lib/format'

export function AddPaymentButton({ students }: { students: { id: string; fullName: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={students.length === 0}>
        <Plus size={18} aria-hidden />
        Төлбөр бүртгэх
      </Button>
      {open && (
        <PaymentFormModal open={open} onClose={() => setOpen(false)} students={students} />
      )}
    </>
  )
}

export function PaymentRowActions({
  payment,
}: {
  payment: {
    id: string
    studentId: string
    studentName: string
    paidAt: string
    coverageYear: number
    coverageMonth: number
    amount: number
    creditsGranted: number
    note: string
    status: 'valid' | 'void'
  }
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)

  if (payment.status === 'void') {
    return <span className="text-[13px] text-[var(--color-muted)]">Хүчингүй болсон</span>
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
        <Pencil size={15} aria-hidden />
        Засах
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setVoidOpen(true)}>
        <Ban size={15} aria-hidden />
        Хүчингүй
      </Button>

      {editOpen && (
        <PaymentFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          paymentId={payment.id}
          students={[{ id: payment.studentId, fullName: payment.studentName }]}
          initialValues={{
            studentId: payment.studentId,
            paidAt: payment.paidAt,
            coverageYear: payment.coverageYear,
            coverageMonth: payment.coverageMonth,
            amount: String(payment.amount),
            creditsGranted: String(payment.creditsGranted),
            note: payment.note,
          }}
        />
      )}

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Төлбөрийг хүчингүй болгох"
        danger
        confirmLabel="Хүчингүй болгох"
        reasonLabel="Шалтгаан"
        reasonRequired
        message={
          <>
            <strong>{payment.studentName}</strong>-ийн {payment.coverageYear} оны{' '}
            {MONTH_NAMES[payment.coverageMonth - 1]}-ийн {formatMoney(payment.amount)} төлбөр
            хүчингүй болно. Олгосон <strong>{payment.creditsGranted} оролтын эрх</strong> нийт
            эрхээс хасагдана. Бүртгэлийн түүх устахгүй.
          </>
        }
        onConfirm={async (reason) => {
          await api.post(`/api/admin/payments/${payment.id}/void`, { reason })
          router.refresh()
        }}
      />
    </div>
  )
}
