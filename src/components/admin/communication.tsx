'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Megaphone, MessageSquare, Plus, Send } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { RequestError, api, newIdempotencyKey } from '@/lib/client-api'
import { formatDateTime } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { AUDIENCE_LABEL } from '@/lib/labels'
import { cx } from '@/lib/format'

type Announcement = {
  id: string
  title: string
  body: string
  audienceType: 'all' | 'group' | 'student'
  groupName: string | null
  studentName: string | null
  publishedAt: string
  recipientCount: number
  readCount: number
}

type Conversation = {
  id: string
  parentUserId: string
  parentName: string
  phone: string | null
  children: string[]
  unread: number
  lastMessage: string | null
  lastMessageAt: string | null
}

type Message = {
  id: string
  senderRole: 'admin' | 'parent'
  body: string
  createdAt: string
  readAt: string | null
}

export function CommunicationTabs({
  activeTab,
  activeParent,
  announcements,
  conversations,
  groups,
  students,
}: {
  activeTab: 'announcements' | 'messages'
  activeParent: string | null
  announcements: Announcement[]
  conversations: Conversation[]
  groups: { id: string; name: string }[]
  students: { id: string; fullName: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [composerOpen, setComposerOpen] = useState(false)

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unread, 0)

  function switchTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    if (tab !== 'messages') params.delete('parent')
    router.push(`/admin/communication?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <PageHeader
        title="Харилцаа"
        description="Эцэг эхэд зар нийтлэх, хувийн зурвасаар харилцах"
        action={
          activeTab === 'announcements' ? (
            <Button onClick={() => setComposerOpen(true)}>
              <Plus size={18} aria-hidden />
              Зар нийтлэх
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <Tabs
          active={activeTab}
          onChange={switchTab}
          tabs={[
            { id: 'announcements', label: 'Зар' },
            { id: 'messages', label: 'Зурвас', badge: unreadTotal || undefined },
          ]}
        />
      </div>

      {activeTab === 'announcements' ? (
        <AnnouncementList announcements={announcements} />
      ) : (
        <MessagesPane conversations={conversations} activeParent={activeParent} />
      )}

      {composerOpen && (
        <AnnouncementComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          groups={groups}
          students={students}
        />
      )}
    </>
  )
}

/* ------------------------------ Зарын жагсаалт ----------------------------- */

function AnnouncementList({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Megaphone size={28} />}
          title="Зар байхгүй байна"
          description="Хуваарийн өөрчлөлт, төлбөрийн сануулга зэргийг эцэг эхэд мэдэгдэнэ үү."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {announcements.map((announcement) => (
        <Card key={announcement.id} className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[var(--color-ink)]">
                {announcement.title}
              </h3>
              <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                {formatDateTime(announcement.publishedAt)} ·{' '}
                {announcement.audienceType === 'group'
                  ? `Бүлэг: ${announcement.groupName ?? '—'}`
                  : announcement.audienceType === 'student'
                    ? `Сурагч: ${announcement.studentName ?? '—'}`
                    : AUDIENCE_LABEL.all}
              </p>
            </div>
            <Badge tone={announcement.readCount === announcement.recipientCount ? 'success' : 'info'}>
              {announcement.readCount} / {announcement.recipientCount} уншсан
            </Badge>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[15px] text-[var(--color-body)]">
            {announcement.body}
          </p>
        </Card>
      ))}
    </div>
  )
}

/* ------------------------------ Зар нийтлэх ------------------------------- */

function AnnouncementComposer({
  open,
  onClose,
  groups,
  students,
}: {
  open: boolean
  onClose: () => void
  groups: { id: string; name: string }[]
  students: { id: string; fullName: string }[]
}) {
  const router = useRouter()
  const [values, setValues] = useState({
    title: '',
    body: '',
    audienceType: 'all' as 'all' | 'group' | 'student',
    groupId: '',
    studentId: '',
  })
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const previewKey = `${values.audienceType}:${values.groupId}:${values.studentId}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (values.audienceType === 'group' && !values.groupId) return setRecipientCount(null)
      if (values.audienceType === 'student' && !values.studentId) return setRecipientCount(null)
      try {
        const params = new URLSearchParams({ audienceType: values.audienceType })
        if (values.groupId) params.set('groupId', values.groupId)
        if (values.studentId) params.set('studentId', values.studentId)
        const result = await api.get<{ count: number }>(
          `/api/admin/announcements/preview?${params.toString()}`,
        )
        if (!cancelled) setRecipientCount(result.count)
      } catch {
        if (!cancelled) setRecipientCount(null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)
    try {
      await api.post('/api/admin/announcements', {
        title: values.title,
        body: values.body,
        audienceType: values.audienceType,
        groupId: values.audienceType === 'group' ? values.groupId : null,
        studentId: values.audienceType === 'student' ? values.studentId : null,
      })
      router.refresh()
      onClose()
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {})
        if (!error.fieldErrors) setFormError(error.message)
      } else {
        setFormError('Нийтлэхэд алдаа гарлаа.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Зар нийтлэх"
      size="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" form="announcement-form" loading={submitting}>
            Нийтлэх
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <ErrorNote message={formError} />}

        <Field label="Гарчиг" htmlFor="title" error={errors.title} required>
          <Input
            id="title"
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            aria-invalid={Boolean(errors.title)}
            autoFocus
          />
        </Field>

        <Field label="Мэдээлэл" htmlFor="body" error={errors.body} required>
          <Textarea
            id="body"
            className="min-h-32"
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
            aria-invalid={Boolean(errors.body)}
          />
        </Field>

        <Field label="Хүлээн авагч" htmlFor="audienceType" error={errors.audienceType} required>
          <Select
            id="audienceType"
            value={values.audienceType}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                audienceType: e.target.value as 'all' | 'group' | 'student',
              }))
            }
          >
            <option value="all">{AUDIENCE_LABEL.all}</option>
            <option value="group">{AUDIENCE_LABEL.group}</option>
            <option value="student">{AUDIENCE_LABEL.student}</option>
          </Select>
        </Field>

        {values.audienceType === 'group' && (
          <Field label="Бүлэг" htmlFor="groupId" error={errors.groupId} required>
            <Select
              id="groupId"
              value={values.groupId}
              onChange={(e) => setValues((v) => ({ ...v, groupId: e.target.value }))}
            >
              <option value="">Сонгоно уу</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {values.audienceType === 'student' && (
          <Field label="Сурагч" htmlFor="studentId" error={errors.studentId} required>
            <Select
              id="studentId"
              value={values.studentId}
              onChange={(e) => setValues((v) => ({ ...v, studentId: e.target.value }))}
            >
              <option value="">Сонгоно уу</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="rounded-[10px] border border-[var(--color-line)] bg-slate-50 px-4 py-3 text-sm">
          {recipientCount === null ? (
            <span className="text-[var(--color-muted)]">Хүлээн авагчийг тодорхойлж байна…</span>
          ) : (
            <span>
              Энэ зар{' '}
              <strong className="text-[var(--color-ink)]">{recipientCount} эцэг эхэд</strong>{' '}
              хүрнэ. Нэг эцэг эх олон хүүхэдтэй бол нэг л удаа хүлээн авна.
            </span>
          )}
        </div>
      </form>
    </Modal>
  )
}

/* -------------------------------- Зурвас ---------------------------------- */

function MessagesPane({
  conversations,
  activeParent,
}: {
  conversations: Conversation[]
  activeParent: string | null
}) {
  const router = useRouter()
  const active = useMemo(
    () => conversations.find((c) => c.parentUserId === activeParent) ?? null,
    [conversations, activeParent],
  )

  function open(parentUserId: string) {
    router.push(`/admin/communication?tab=messages&parent=${parentUserId}`, { scroll: false })
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<MessageSquare size={28} />}
          title="Харилцаа алга"
          description="Сурагч бүртгэсний дараа эцэг эх бүрд хувийн зурвасын суваг үүснэ."
        />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className={cx(active && 'hidden lg:block')}>
        <CardHeader title="Эцэг эхчүүд" description={`${conversations.length} харилцаа`} />
        <ul className="max-h-[60vh] divide-y divide-[var(--color-line)] overflow-y-auto">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => open(conversation.parentUserId)}
                className={cx(
                  'w-full px-4 py-3 text-left hover:bg-slate-50',
                  active?.id === conversation.id && 'bg-[var(--color-primary-soft)]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-[var(--color-ink)]">
                    {conversation.parentName}
                  </p>
                  {conversation.unread > 0 && (
                    <span className="rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {conversation.unread}
                    </span>
                  )}
                </div>
                <p className="truncate text-[13px] text-[var(--color-muted)]">
                  {formatPhone(conversation.phone)} · {conversation.children.join(', ') || '—'}
                </p>
                {conversation.lastMessage && (
                  <p className="mt-1 truncate text-[13px] text-[var(--color-faint)]">
                    {conversation.lastMessage}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {active ? (
        <Thread conversation={active} onBack={() => router.push('/admin/communication?tab=messages')} />
      ) : (
        <Card className="hidden lg:block">
          <EmptyState
            icon={<MessageSquare size={28} />}
            title="Харилцаа сонгоно уу"
            description="Зүүн талаас эцэг эхийг сонгож зурвас бичнэ үү."
          />
        </Card>
      )}
    </div>
  )
}

function Thread({
  conversation,
  onBack,
}: {
  conversation: Conversation
  onBack: () => void
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const clientKey = useRef(newIdempotencyKey())
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ messages: Message[] }>(
        `/api/admin/conversations/${conversation.id}/messages`,
      )
      setMessages(result.messages)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof RequestError ? error.message : 'Зурвас ачаалж чадсангүй.')
    }
  }, [conversation.id])

  useEffect(() => {
    setMessages(null)
    load()
    // Real-time шаардлагагүй — тогтмол сэргээлт хангалттай
    const timer = setInterval(load, 15_000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (sending || !draft.trim()) return
    setSending(true)
    setSendError(null)
    try {
      await api.post(`/api/admin/conversations/${conversation.id}/messages`, {
        body: draft,
        clientKey: clientKey.current,
      })
      clientKey.current = newIdempotencyKey()
      setDraft('')
      await load()
      router.refresh()
    } catch (error) {
      // Бичсэн текст алдагдахгүй — дахин илгээх боломжтой
      setSendError(
        error instanceof RequestError ? error.message : 'Илгээж чадсангүй. Дахин оролдоно уу.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Буцах"
          className="-ml-2 rounded-[10px] p-2 hover:bg-slate-100 lg:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--color-ink)]">
            {conversation.parentName}
          </p>
          <p className="truncate text-[13px] text-[var(--color-muted)]">
            {formatPhone(conversation.phone)} · {conversation.children.join(', ') || '—'}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages === null && !loadError && <Spinner />}
        {loadError && <ErrorNote message={loadError} onRetry={load} />}
        {messages?.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            Зурвас алга байна. Эхний зурвасаа бичнэ үү.
          </p>
        )}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={cx(
              'max-w-[80%] rounded-[12px] px-3.5 py-2.5',
              message.senderRole === 'admin'
                ? 'ml-auto bg-[var(--color-primary)] text-white'
                : 'bg-slate-100 text-[var(--color-body)]',
            )}
          >
            <p className="whitespace-pre-wrap text-[15px]">{message.body}</p>
            <p
              className={cx(
                'mt-1 text-[12px]',
                message.senderRole === 'admin' ? 'text-white/70' : 'text-[var(--color-muted)]',
              )}
            >
              {message.senderRole === 'admin' ? 'Админ' : conversation.parentName} ·{' '}
              {formatDateTime(message.createdAt)}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-[var(--color-line)] px-4 py-3">
        {sendError && (
          <div className="mb-2">
            <ErrorNote message={sendError} />
          </div>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="admin-message">
            Зурвас
          </label>
          <Textarea
            id="admin-message"
            className="min-h-11 flex-1"
            rows={2}
            placeholder="Зурвасаа бичнэ үү…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" loading={sending} disabled={!draft.trim()}>
            <Send size={16} aria-hidden />
            Илгээх
          </Button>
        </div>
      </form>
    </Card>
  )
}
