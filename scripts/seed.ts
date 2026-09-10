/**
 * Development seed — зохиомол demo өгөгдөл.
 * Дахин ажиллуулахад давхар өгөгдөл үүсгэхгүй (marker-ээр шалгана).
 * Production дээр ALLOW_SEED_IN_PRODUCTION="true" биш бол ажиллахгүй.
 */
import './env'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db'
import {
  announcementRecipients,
  announcements,
  attendance,
  conversations,
  groupMemberships,
  messages,
  parentStudents,
  payments,
  sessionParticipants,
  students,
  trainingGroups,
  trainingSessions,
  users,
} from '../src/db/schema'
import { hashSecret } from '../src/lib/password'
import { assertSafeTarget } from './guard'
import { todayInUb } from '../src/lib/date'

const DEMO_ADMIN_EMAIL = 'admin@volleyball.mn'
const DEMO_ADMIN_PASSWORD = 'Admin123!'
const DEMO_PARENT_CODE = 'demo1234'

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    console.error('  ✗ Production орчинд demo seed ажиллуулахыг хориглосон.')
    process.exit(1)
  }

  // NODE_ENV-ээс үл хамааран алсын (Supabase г.м.) сан руу зохиомол өгөгдөл оруулахгүй
  assertSafeTarget(process.env.DATABASE_URL ?? '', 'db:seed')



  const existingAdmin = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_ADMIN_EMAIL))
    .limit(1)

  if (existingAdmin.length) {
    console.log('  • Demo өгөгдөл аль хэдийн үүссэн байна — алгаслаа.')
    console.log('    Дахин үүсгэхийг хүсвэл: npm run db:reset && npm run db:migrate && npm run db:seed')
    process.exit(0)
  }

  const today = todayInUb()
  const [yearStr, monthStr] = today.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateOf = (day: number) => `${year}-${pad(month)}-${pad(day)}`
  const todayDay = Number(today.slice(8, 10))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  /* ------------------------------- админ ------------------------------- */
  const [admin] = await db
    .insert(users)
    .values({
      role: 'admin',
      email: DEMO_ADMIN_EMAIL,
      displayName: 'Батбаяр (админ)',
      passwordHash: await hashSecret(DEMO_ADMIN_PASSWORD),
    })
    .returning({ id: users.id })

  /* ------------------------------- бүлгүүд ----------------------------- */
  const groupRows = await db
    .insert(trainingGroups)
    .values([
      { name: 'Анхан шат', description: '8–11 нас, үндсэн дадлага' },
      { name: 'Ахисан шат', description: '12–15 нас, тактик, тэмцээний бэлтгэл' },
    ])
    .returning({ id: trainingGroups.id, name: trainingGroups.name })

  const beginner = groupRows.find((g) => g.name === 'Анхан шат')!
  const advanced = groupRows.find((g) => g.name === 'Ахисан шат')!

  /* ------------------------- эцэг эх ба сурагчид ----------------------- */
  type SeedStudent = {
    name: string
    group: string
    phone: string
    parentName: string
    registered: string
    status?: 'active' | 'inactive'
    /** олгосон эрхийн багцууд */
    grants: { credits: number; amount: number; monthOffset: number; day: number }[]
    /** энэ сард хэдэн удаа ирснээр тэмдэглэх */
    presentCount: number
    note?: string
  }

  const prevMonthDate = (day: number) => {
    const d = new Date(Date.UTC(year, month - 2, day))
    return d.toISOString().slice(0, 10)
  }

  const seedStudents: SeedStudent[] = [
    {
      name: 'Ухаантөгс',
      group: beginner.name,
      phone: '99112233',
      parentName: 'Сарантуяа',
      registered: prevMonthDate(28),
      grants: [{ credits: 12, amount: 120000, monthOffset: 0, day: 3 }],
      presentCount: 7,
      note: 'Ах дүү хоёулаа ирдэг. Тээврийн асуудлаас болж заримдаа хоцордог.',
    },
    {
      name: 'Тэмүүлэн',
      group: advanced.name,
      phone: '99112233',
      parentName: 'Сарантуяа',
      registered: prevMonthDate(28),
      grants: [{ credits: 12, amount: 140000, monthOffset: 0, day: 3 }],
      presentCount: 4,
    },
    {
      name: 'Ануужин',
      group: beginner.name,
      phone: '88445566',
      parentName: 'Оюунчимэг',
      registered: prevMonthDate(12),
      grants: [{ credits: 12, amount: 120000, monthOffset: 0, day: 5 }],
      presentCount: 11,
      note: 'Эрх дуусах дөхсөн — сануулах.',
    },
    {
      name: 'Батжаргал',
      group: beginner.name,
      phone: '95556677',
      parentName: 'Ганбат',
      registered: prevMonthDate(2),
      grants: [{ credits: 12, amount: 120000, monthOffset: -1, day: 2 }],
      presentCount: 12,
      note: 'Энэ сарын төлбөр төлөөгүй, эрх дууссан.',
    },
    {
      name: 'Сүхболд',
      group: advanced.name,
      phone: '99887766',
      parentName: 'Дэлгэрмаа',
      registered: prevMonthDate(20),
      grants: [{ credits: 12, amount: 140000, monthOffset: 0, day: 2 }],
      presentCount: 0,
    },
    {
      name: 'Мөнхзул',
      group: advanced.name,
      phone: '94443322',
      parentName: 'Энхтуяа',
      registered: prevMonthDate(8),
      grants: [{ credits: 12, amount: 140000, monthOffset: -1, day: 6 }],
      presentCount: 9,
    },
    {
      name: 'Хулан',
      group: beginner.name,
      phone: '86001122',
      parentName: 'Пүрэвдорж',
      registered: prevMonthDate(15),
      grants: [
        { credits: 12, amount: 120000, monthOffset: -1, day: 4 },
        { credits: 12, amount: 120000, monthOffset: 0, day: 4 },
      ],
      presentCount: 7,
      note: 'Хоёр багц авсан — үлдэгдэл шилжсэн.',
    },
    {
      name: 'Номин-Эрдэнэ',
      group: advanced.name,
      phone: '99001188',
      parentName: 'Цэрэнлхам',
      registered: prevMonthDate(18),
      grants: [{ credits: 12, amount: 140000, monthOffset: 0, day: 6 }],
      presentCount: 3,
    },
    {
      name: 'Эрдэнэбат',
      group: beginner.name,
      phone: '80112244',
      parentName: 'Мөнхбат',
      registered: dateOf(Math.min(2, daysInMonth)),
      grants: [],
      presentCount: 0,
      note: 'Шинэ сурагч — төлбөр хараахан бүртгэгдээгүй.',
    },
    {
      name: 'Тэмүүжин',
      group: beginner.name,
      phone: '91234567',
      parentName: 'Алтанцэцэг',
      registered: prevMonthDate(5),
      status: 'inactive',
      grants: [{ credits: 12, amount: 120000, monthOffset: -1, day: 5 }],
      presentCount: 5,
      note: 'Гэр бүлийн шалтгаанаар түр завсарласан.',
    },
  ]

  const parentIdByPhone = new Map<string, string>()
  const studentIdByName = new Map<string, string>()
  const groupIdByName = new Map(groupRows.map((g) => [g.name, g.id]))

  const parentHash = await hashSecret(DEMO_PARENT_CODE)

  for (const seed of seedStudents) {
    let parentId = parentIdByPhone.get(seed.phone)
    if (!parentId) {
      const [parent] = await db
        .insert(users)
        .values({
          role: 'parent',
          phone: seed.phone,
          displayName: seed.parentName,
          passwordHash: parentHash,
          // Demo-д шууд нэвтрэх боломжтой байлгав; жинхэнэ урсгалд true байна
          mustChangePassword: false,
        })
        .returning({ id: users.id })
      parentId = parent.id
      parentIdByPhone.set(seed.phone, parentId)
      await db.insert(conversations).values({ parentUserId: parentId })
    }

    const groupId = groupIdByName.get(seed.group)!
    const [student] = await db
      .insert(students)
      .values({
        fullName: seed.name,
        registeredAt: seed.registered,
        currentGroupId: groupId,
        status: seed.status ?? 'active',
        adminNote: seed.note ?? null,
      })
      .returning({ id: students.id })

    studentIdByName.set(seed.name, student.id)
    await db.insert(parentStudents).values({ parentUserId: parentId, studentId: student.id })
    await db.insert(groupMemberships).values({ studentId: student.id, groupId })

    for (const grant of seed.grants) {
      const gYear = grant.monthOffset === 0 ? year : month === 1 ? year - 1 : year
      const gMonth = grant.monthOffset === 0 ? month : month === 1 ? 12 : month - 1
      const paidAt =
        grant.monthOffset === 0 ? dateOf(grant.day) : prevMonthDate(grant.day)
      await db.insert(payments).values({
        studentId: student.id,
        paidAt,
        coverageYear: gYear,
        coverageMonth: gMonth,
        amount: grant.amount,
        creditsGranted: grant.credits,
        createdBy: admin.id,
        note: '(demo) бэлэн мөнгө',
      })
    }
  }

  /* ------------------------------ бэлтгэлүүд ---------------------------- */
  // Анхан: Да/Лх/Ба, Ахисан: Мя/Пү — тухайн сарын бүх өдрөөр
  const sessionsToCreate: {
    groupId: string
    date: string
    start: string
    end: string
    location: string
  }[] = []

  const prevDaysInMonth = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()
  const calendarDays = [
    ...Array.from({ length: prevDaysInMonth }, (_, i) => prevMonthDate(i + 1)),
    ...Array.from({ length: daysInMonth }, (_, i) => dateOf(i + 1)),
  ]

  for (const iso of calendarDays) {
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay()
    if ([1, 3, 5].includes(weekday)) {
      sessionsToCreate.push({
        groupId: beginner.id,
        date: iso,
        start: '17:00:00',
        end: '18:30:00',
        location: '1-р спорт заал',
      })
    }
    if ([2, 4].includes(weekday)) {
      sessionsToCreate.push({
        groupId: advanced.id,
        date: iso,
        start: '18:30:00',
        end: '20:00:00',
        location: 'Төв спорт цогцолбор',
      })
    }
  }

  const insertedSessions = await db
    .insert(trainingSessions)
    .values(
      sessionsToCreate.map((s) => ({
        groupId: s.groupId,
        date: s.date,
        startTime: s.start,
        endTime: s.end,
        location: s.location,
        status: (s.date < today ? 'completed' : 'planned') as 'completed' | 'planned',
        createdBy: admin.id,
      })),
    )
    .returning({
      id: trainingSessions.id,
      groupId: trainingSessions.groupId,
      date: trainingSessions.date,
    })

  // Roster snapshot
  const activeStudents = await db
    .select({ id: students.id, groupId: students.currentGroupId, status: students.status })
    .from(students)

  const rosterValues: { sessionId: string; studentId: string }[] = []
  for (const session of insertedSessions) {
    for (const student of activeStudents) {
      if (student.groupId !== session.groupId) continue
      if (student.status !== 'active' && session.date >= today) continue
      rosterValues.push({ sessionId: session.id, studentId: student.id })
    }
  }
  if (rosterValues.length) await db.insert(sessionParticipants).values(rosterValues)

  /* -------------------------------- ирц -------------------------------- */
  const attendanceValues: {
    sessionId: string
    studentId: string
    status: 'present' | 'absent' | 'excused'
    creditConsumed: boolean
    markedBy: string
  }[] = []

  for (const seed of seedStudents) {
    const studentId = studentIdByName.get(seed.name)!
    const groupId = groupIdByName.get(seed.group)!
    const pastSessions = insertedSessions
      .filter((s) => s.groupId === groupId && s.date <= today)
      // Хамгийн сүүлийн бэлтгэлүүдээс эхлэн бүртгэнэ
      .sort((a, b) => b.date.localeCompare(a.date))

    let remainingPresent = seed.presentCount
    for (const session of pastSessions) {
      if (remainingPresent > 0) {
        attendanceValues.push({
          sessionId: session.id,
          studentId,
          status: 'present',
          creditConsumed: true,
          markedBy: admin.id,
        })
        remainingPresent -= 1
      }
    }
    // Нэг тасалсан, нэг чөлөөтэй жишээ
    const extra = pastSessions.slice(seed.presentCount, seed.presentCount + 2)
    if (extra[0]) {
      attendanceValues.push({
        sessionId: extra[0].id,
        studentId,
        status: 'absent',
        creditConsumed: false,
        markedBy: admin.id,
      })
    }
    if (extra[1]) {
      attendanceValues.push({
        sessionId: extra[1].id,
        studentId,
        status: 'excused',
        creditConsumed: false,
        markedBy: admin.id,
      })
    }
  }

  // Зөвхөн roster-д байгаа хосуудыг үлдээнэ
  const rosterKeys = new Set(rosterValues.map((r) => `${r.sessionId}:${r.studentId}`))
  const validAttendance = attendanceValues.filter((a) =>
    rosterKeys.has(`${a.sessionId}:${a.studentId}`),
  )
  if (validAttendance.length) await db.insert(attendance).values(validAttendance)

  /* ------------------------------- зарууд ------------------------------ */
  const allParents = [...parentIdByPhone.values()]

  const [announcementAll] = await db
    .insert(announcements)
    .values({
      title: 'Энэ сарын хуваарийн өөрчлөлт',
      body:
        'Сайн байна уу. Ирэх долоо хоногийн Баасан гарагийн бэлтгэл заалны засварын улмаас 17:00 цагаас 18:00 болж өөрчлөгдлөө. Ойлгомжтой байхыг хүсье.',
      audienceType: 'all',
      createdBy: admin.id,
    })
    .returning({ id: announcements.id })

  await db.insert(announcementRecipients).values(
    allParents.map((parentUserId) => ({
      announcementId: announcementAll.id,
      parentUserId,
    })),
  )

  const beginnerParents = await db
    .select({ parentUserId: parentStudents.parentUserId })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.studentId))
    .where(and(eq(students.currentGroupId, beginner.id), eq(students.status, 'active')))

  const uniqueBeginnerParents = [...new Set(beginnerParents.map((p) => p.parentUserId))]

  const [announcementGroup] = await db
    .insert(announcements)
    .values({
      title: 'Анхан шат: төлбөрийн сануулга',
      body:
        'Энэ сарын төлбөрөө 15-ны дотор төлнө үү. Оролтын эрх дуусмагц бэлтгэлд оролцох боломжгүй болно.',
      audienceType: 'group',
      groupId: beginner.id,
      createdBy: admin.id,
    })
    .returning({ id: announcements.id })

  await db.insert(announcementRecipients).values(
    uniqueBeginnerParents.map((parentUserId) => ({
      announcementId: announcementGroup.id,
      parentUserId,
    })),
  )

  /* ------------------------------- зурвас ------------------------------ */
  const mainParentId = parentIdByPhone.get('99112233')!
  const conv = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.parentUserId, mainParentId))
    .limit(1)

  await db.insert(messages).values([
    {
      conversationId: conv[0].id,
      senderUserId: mainParentId,
      senderRole: 'parent',
      body: 'Сайн байна уу. Ухаантөгс маргаашийн бэлтгэлд өвчтэй тул ирэхгүй.',
      readAt: new Date(),
    },
    {
      conversationId: conv[0].id,
      senderUserId: admin.id,
      senderRole: 'admin',
      body: 'Ойлголоо, баярлалаа. Чөлөөтэй гэж тэмдэглэлээ. Эрх хасагдахгүй.',
    },
  ])

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conv[0].id))

  console.log('\n  ✓ Demo өгөгдөл үүслээ (өнөөдөр:', today, ')\n')
  console.log('  Админ:')
  console.log(`    и-мэйл : ${DEMO_ADMIN_EMAIL}`)
  console.log(`    нууц үг: ${DEMO_ADMIN_PASSWORD}`)
  console.log('\n  Эцэг эх (бүгд ижил demo кодтой):')
  console.log(`    нууц код: ${DEMO_PARENT_CODE}`)
  console.log('    99112233 — Сарантуяа (2 хүүхэдтэй: Ухаантөгс, Тэмүүлэн)')
  console.log('    88445566 — Оюунчимэг (Ануужин — эрх дуусах дөхсөн)')
  console.log('    95556677 — Ганбат (Батжаргал — төлбөргүй, эрх дууссан)')
  console.log('    86001122 — Пүрэвдорж (Хулан — 2 багц авсан)')
  console.log('')
  process.exit(0)
}

main().catch((error) => {
  console.error('  ✗ Seed амжилтгүй:', error)
  process.exit(1)
})
