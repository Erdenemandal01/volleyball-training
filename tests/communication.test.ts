import { beforeEach, describe, expect, it } from 'vitest'
import {
  assertConversationAccess,
  createAnnouncement,
  ensureConversation,
  getConversationMessages,
  listAnnouncementsForParent,
  markAnnouncementRead,
  previewAnnouncementRecipients,
  sendMessage,
  unreadAnnouncementCount,
} from '@/lib/services/communication'
import { createStudent, assertParentOwnsStudent, updateStudent } from '@/lib/services/students'
import { parentStudentOverview } from '@/lib/services/parent'
import { todayInUb } from '@/lib/date'
import { makeAdmin, makeGroup, setupDb } from './helpers'

let adminId: string
let groupA: string
let groupB: string
const today = todayInUb()
const year = Number(today.slice(0, 4))
const month = Number(today.slice(5, 7))

beforeEach(async () => {
  await setupDb()
  adminId = await makeAdmin()
  groupA = await makeGroup('Анхан шат')
  groupB = await makeGroup('Ахисан шат')
})

async function addStudent(name: string, phone: string, groupId: string) {
  return createStudent({
    fullName: name,
    registeredAt: today,
    groupId,
    parentPhone: phone,
    actorId: adminId,
  })
}

describe('Зар', () => {
  it('№15: зар зөв хүлээн авагчид очно, давхардсан эцэг эх нэг л удаа', async () => {
    const first = await addStudent('Ах', '99112233', groupA)
    await addStudent('Дүү', '99112233', groupB) // ижил эцэг эх
    const other = await addStudent('Бусад', '88776655', groupB)

    const previewAll = await previewAnnouncementRecipients({ audienceType: 'all' })
    expect(previewAll.count).toBe(2) // 3 сурагч, гэхдээ 2 эцэг эх

    const previewGroup = await previewAnnouncementRecipients({
      audienceType: 'group',
      groupId: groupA,
    })
    expect(previewGroup.count).toBe(1)

    const created = await createAnnouncement({
      title: 'Анхан шатны зар',
      body: 'Маргаашийн бэлтгэл 18:00 цагт болно.',
      audienceType: 'group',
      groupId: groupA,
      actorId: adminId,
    })
    expect(created.recipients).toBe(1)

    const forParent = await listAnnouncementsForParent(first.parentUserId)
    expect(forParent).toHaveLength(1)

    const forOther = await listAnnouncementsForParent(other.parentUserId)
    expect(forOther).toHaveLength(0)
  })

  it('Нийтэлсний дараа бүлэг өөрчлөгдөхөд хуучин зарын хүлээн авагч өөрчлөгдөхгүй', async () => {
    const student = await addStudent('Ухаантөгс', '99112233', groupA)
    await createAnnouncement({
      title: 'Анхан шат',
      body: 'Мэдээлэл',
      audienceType: 'group',
      groupId: groupA,
      actorId: adminId,
    })

    await updateStudent({
      studentId: student.studentId,
      fullName: 'Ухаантөгс',
      registeredAt: today,
      groupId: groupB,
      parentPhone: '99112233',
      actorId: adminId,
    })

    const forParent = await listAnnouncementsForParent(student.parentUserId)
    expect(forParent).toHaveLength(1)
  })

  it('Уншсан төлөв хадгалагдана', async () => {
    const student = await addStudent('Ухаантөгс', '99112233', groupA)
    const created = await createAnnouncement({
      title: 'Зар',
      body: 'Мэдээлэл',
      audienceType: 'all',
      actorId: adminId,
    })
    expect(await unreadAnnouncementCount(student.parentUserId)).toBe(1)
    await markAnnouncementRead(student.parentUserId, created.id)
    expect(await unreadAnnouncementCount(student.parentUserId)).toBe(0)
  })
})

describe('Хувийн зурвас', () => {
  it('№16: бусдын conversation-д хандах боломжгүй', async () => {
    const a = await addStudent('А сурагч', '99112233', groupA)
    const b = await addStudent('Б сурагч', '88776655', groupA)

    const convA = await ensureConversation(a.parentUserId)
    await sendMessage({
      conversationId: convA,
      senderUserId: a.parentUserId,
      senderRole: 'parent',
      body: 'Сайн байна уу',
    })

    await expect(
      assertConversationAccess(convA, { id: b.parentUserId, role: 'parent' }),
    ).rejects.toThrow(/олдсонгүй/)

    // Админ хандаж чадна
    await expect(
      assertConversationAccess(convA, { id: adminId, role: 'admin' }),
    ).resolves.toBeTruthy()

    const messages = await getConversationMessages(convA)
    expect(messages).toHaveLength(1)
  })

  it('Ижил clientKey-тэй давхар илгээлт нэг зурвас үүсгэнэ', async () => {
    const a = await addStudent('А сурагч', '99112233', groupA)
    const conv = await ensureConversation(a.parentUserId)
    const key = 'msg-key-12345678'
    await sendMessage({
      conversationId: conv,
      senderUserId: a.parentUserId,
      senderRole: 'parent',
      body: 'Сайн уу',
      clientKey: key,
    })
    await sendMessage({
      conversationId: conv,
      senderUserId: a.parentUserId,
      senderRole: 'parent',
      body: 'Сайн уу',
      clientKey: key,
    })
    expect(await getConversationMessages(conv)).toHaveLength(1)
  })
})

describe('Эцэг эхийн хандалт', () => {
  it('№1, №2: нэг эцэг эх хоёр хүүхэдтэй, зөвхөн өөрийн хүүхдээ харна', async () => {
    const first = await addStudent('Ухаантөгс', '99112233', groupA)
    const second = await addStudent('Тэмүүлэн', '99112233', groupB)
    const stranger = await addStudent('Бусдын хүүхэд', '88776655', groupA)

    expect(second.parentUserId).toBe(first.parentUserId)

    await expect(
      assertParentOwnsStudent(first.parentUserId, first.studentId),
    ).resolves.toBeUndefined()
    await expect(
      assertParentOwnsStudent(first.parentUserId, second.studentId),
    ).resolves.toBeUndefined()

    // №13: бусдын хүүхдийн мэдээллийг ID-гаар нь ч авах боломжгүй
    await expect(
      assertParentOwnsStudent(first.parentUserId, stranger.studentId),
    ).rejects.toThrow(/олдсонгүй/)

    await expect(
      parentStudentOverview({
        parentUserId: first.parentUserId,
        studentId: stranger.studentId,
        year,
        month,
      }),
    ).rejects.toThrow(/олдсонгүй/)

    const overview = await parentStudentOverview({
      parentUserId: first.parentUserId,
      studentId: second.studentId,
      year,
      month,
    })
    expect(overview.student.fullName).toBe('Тэмүүлэн')
  })
})
