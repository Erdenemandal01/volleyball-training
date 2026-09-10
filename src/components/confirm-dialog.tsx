'use client'

import { useEffect, useState } from 'react'
import { Button, ErrorNote, Field, Input, Modal } from '@/components/ui'
import { RequestError } from '@/lib/client-api'

/**
 * Баталгаажуулах цонх — юу болох, хэнд нөлөөлөхийг тодорхой хэлнэ.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Батлах',
  danger,
  reasonLabel,
  reasonRequired,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  reasonLabel?: string
  reasonRequired?: boolean
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Цонх нээгдэх бүрд өмнөх алдаа, бичсэн шалтгааныг цэвэрлэнэ
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  /** Хадгалж байх үед цонх хаагдахгүй — үйлдэл дундуур тасрахаас сэргийлнэ */
  function requestClose() {
    if (submitting) return
    onClose()
  }

  async function confirm() {
    if (submitting) return
    if (reasonRequired && reason.trim().length < 3) {
      setError('Шалтгаанаа бичнэ үү (дор хаяж 3 тэмдэгт).')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
      setReason('')
      onClose()
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Үйлдэл гүйцэтгэхэд алдаа гарлаа.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      dismissable={!submitting}
      title={title}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={requestClose} disabled={submitting}>
            Болих
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={confirm}
            loading={submitting}
            type="button"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote message={error} />}
        <div className="text-[15px] text-[var(--color-body)]">{message}</div>
        {reasonLabel && (
          <Field label={reasonLabel} htmlFor="confirm-reason" required={reasonRequired}>
            <Input
              id="confirm-reason"
              value={reason}
              disabled={submitting}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}
