'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Megaphone, MessageSquare, Send } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Spinner,
  Tabs,
  Textarea,
} from '@/components/ui'
import { RequestError, api, newIdempotencyKey } from '@/lib/client-api'
import { formatDateTime } from '@/lib/date'
import { cx } from '@/lib/format'

type Announcement = {
  id: string
  title: string
  body: string
  publishedAt: string
  read: boolean
}

type Message = {
  id: string
  senderRole: 'admin' | 'parent'
  body: string
  createdAt: string
}

export function ParentCommunication({
  activeTab,
  announcements,
  childNames,
}: {
  activeTab: 'announcements' | 'messages'
  announcements: Announcement[]
  childNames: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const unreadAnnouncements = announcements.filter((a) => !a.read).length

  function switchTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`/parent/messages?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Харилцаа</h2>

      <Tabs
        active={activeTab}
        onChange={switchTab}
        tabs={[
          { id: 'announcements', label: 'Зар', badge: unreadAnnouncements || undefined },
          { id: 'messages', label: 'Зурвас' },
        ]}
      />

      {activeTab === 'announcements' ? (
        <AnnouncementFeed announcements={announcements} />
      ) : (
        <ParentThread childNames={childNames} />
      )}
    </div>
  )
}

function AnnouncementFeed({ announcements }: { announcements: Announcement[] }) {
  const router = useRouter()
  const marked = useRef(false)

  useEffect(() => {
    if (marked.current) return
    const unread = announcements.filter((a) => !a.read)
    if (unread.length === 0) return
    marked.current = true
    Promise.all(
      unread.map((a) => api.post(`/api/parent/announcements/${a.id}/read`).catch(() => null)),
    ).then(() => router.refresh())
  }, [announcements, router])

  if (announcements.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Megaphone size={28} />}
          title="Зар алга байна"
          description="Сургалтын мэдээлэл, хуваарийн өөрчлөлт энд харагдана."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {announcements.map((announcement) => (
        <Card key={announcement.id} className="px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-[var(--color-ink)]">{announcement.title}</h3>
            {!announcement.read && <Badge tone="info">Шинэ</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            {formatDateTime(announcement.publishedAt)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] text-[var(--color-body)]">
            {announcement.body}
          </p>
        </Card>
      ))}
    </div>
  )
}

function ParentThread({ childNames }: { childNames: string[] }) {
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const clientKey = useRef(newIdempotencyKey())
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ messages: Message[] }>('/api/parent/messages')
      setMessages(result.messages)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof RequestError ? error.message : 'Зурвас ачаалж чадсангүй.')
    }
  }, [])

  useEffect(() => {
    load()
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
      await api.post('/api/parent/messages', { body: draft, clientKey: clientKey.current })
      clientKey.current = newIdempotencyKey()
      setDraft('')
      await load()
    } catch (error) {
      setSendError(
        error instanceof RequestError ? error.message : 'Илгээж чадсангүй. Дахин оролдоно уу.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex h-[62vh] flex-col">
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <p className="font-semibold text-[var(--color-ink)]">Сургалтын админ</p>
        <p className="text-[13px] text-[var(--color-muted)]">
          {childNames.length > 0 ? childNames.join(', ') : 'Хувийн харилцаа'}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages === null && !loadError && <Spinner />}
        {loadError && <ErrorNote message={loadError} onRetry={load} />}
        {messages?.length === 0 && (
          <EmptyState
            icon={<MessageSquare size={26} />}
            title="Зурвас алга"
            description="Асуух зүйл байвал админд шууд бичнэ үү."
          />
        )}
        {messages?.map((message) => (
          <div
            key={message.id}
            className={cx(
              'max-w-[85%] rounded-[12px] px-3.5 py-2.5',
              message.senderRole === 'parent'
                ? 'ml-auto bg-[var(--color-primary)] text-white'
                : 'bg-slate-100 text-[var(--color-body)]',
            )}
          >
            <p className="whitespace-pre-wrap text-[15px]">{message.body}</p>
            <p
              className={cx(
                'mt-1 text-[12px]',
                message.senderRole === 'parent' ? 'text-white/70' : 'text-[var(--color-muted)]',
              )}
            >
              {message.senderRole === 'parent' ? 'Та' : 'Админ'} ·{' '}
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
          <label htmlFor="parent-message" className="sr-only">
            Зурвас
          </label>
          <Textarea
            id="parent-message"
            className="min-h-11 flex-1"
            rows={2}
            placeholder="Зурвасаа бичнэ үү…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" aria-label="Илгээх" loading={sending} disabled={!draft.trim()}>
            <Send size={16} aria-hidden />
            <span className="hidden sm:inline">Илгээх</span>
          </Button>
        </div>
      </form>
    </Card>
  )
}
