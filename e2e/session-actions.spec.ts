import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@volleyball.mn'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!'

async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('И-мэйл').fill(ADMIN_EMAIL)
  await page.getByLabel('Нууц үг').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Нэвтрэх' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Хяналтын самбар' })).toBeVisible()
}

/** Тест бүр өөрийн бэлтгэлээ үүсгэнэ — бусад өгөгдөлд хүрэхгүй. */
async function createSession(page: Page, dayOffset: number) {
  // Тест бүр өөрийн танигдах байршилтай — өмнөх ажиллуулалттай хутгалдахгүй
  const marker = `E2E-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const groups = await (await page.request.get('/api/admin/groups')).json()
  const date = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10)
  const response = await page.request.post('/api/admin/sessions', {
    data: {
      groupId: groups.groups[0].id,
      date,
      startTime: '06:00',
      endTime: '07:00',
      location: marker,
      note: 'E2E',
    },
  })
  expect(response.status()).toBe(201)
  const { id } = await response.json()
  return { id, date, marker }
}

function mnDate(iso: string) {
  return iso.replaceAll('-', '.')
}

test.describe('Бэлтгэл устгах / цуцлах', () => {
  test('Жагсаалтаас ирцгүй бэлтгэлийг устгана', async ({ page }) => {
    await loginAsAdmin(page)
    const session = await createSession(page, 40)

    await page.goto('/admin/training?month=' + session.date.slice(0, 7))
    const row = page.locator('li').filter({ hasText: session.marker }).first()
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: /үйлдэл$/ }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Устгах' })).toBeEnabled()
    await menu.getByRole('menuitem', { name: 'Устгах' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(mnDate(session.date))
    await expect(dialog).toContainText('бүрмөсөн устана')
    await dialog.getByRole('button', { name: 'Бэлтгэлийг устгах' }).click()

    await expect(page.locator('li').filter({ hasText: session.marker })).toHaveCount(0)
    const check = await page.request.get(`/api/admin/sessions/${session.id}`)
    expect(check.status()).toBe(404)
  })

  test('Ирцтэй бэлтгэлийг цуцлахад эрх буцаж, устгах хаагдана', async ({ page }) => {
    await loginAsAdmin(page)
    const session = await createSession(page, -1)

    await page.goto(`/admin/training/${session.id}`)
    await expect(page.getByRole('heading', { name: 'Ирц бүртгэх' })).toBeVisible()

    // Эхний сурагчийг "Ирсэн" болгож эрх зарцуулна
    const firstRow = page.locator('li').filter({ hasText: 'Үлдсэн эрх:' }).first()
    await firstRow.getByRole('radio', { name: 'Ирсэн' }).click()
    await expect(firstRow.getByText('Хадгалагдлаа')).toBeVisible()
    const usedText = await firstRow.textContent()
    const remainingAfterMark = Number(/Үлдсэн эрх:\s*(\d+)/.exec(usedText ?? '')?.[1])

    // Одоо устгах боломжгүй, тайлбартай
    const deleteButton = page.getByRole('button', { name: 'Устгах' })
    await expect(deleteButton).toBeDisabled()
    await expect(page.getByText('Ирц бүртгэгдсэн тул устгах боломжгүй.')).toBeVisible()

    // Цуцлахад эрх буцна
    await page.getByRole('button', { name: 'Цуцлах' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('оролтын эрх буцаагдана')
    await dialog.getByLabel('Цуцлах шалтгаан').fill('E2E тест')
    await dialog.getByRole('button', { name: 'Бэлтгэлийг цуцлах' }).click()

    await expect(page.getByText('Цуцлагдсан шалтгаан: E2E тест')).toBeVisible()
    const refundedRow = page.locator('li').filter({ hasText: 'Үлдсэн эрх:' }).first()
    await expect(refundedRow).toContainText(String(remainingAfterMark + 1))
  })

  test('Шалтгаангүйгээр цуцлахыг зөвшөөрөхгүй', async ({ page }) => {
    await loginAsAdmin(page)
    const session = await createSession(page, 41)

    await page.goto(`/admin/training/${session.id}`)
    await page.getByRole('button', { name: 'Цуцлах' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Бэлтгэлийг цуцлах' }).click()
    await expect(dialog.getByText('Шалтгаанаа бичнэ үү')).toBeVisible()
    await expect(dialog).toBeVisible()

    // Цонхыг хаагаад дахин нээхэд өмнөх алдаа үлдэхгүй
    await dialog.getByRole('button', { name: 'Болих' }).click()
    await page.getByRole('button', { name: 'Цуцлах' }).click()
    await expect(page.getByRole('dialog').getByText('Шалтгаанаа бичнэ үү')).toBeHidden()
  })

  test('Цуцлагдсан бэлтгэлд устгах/цуцлах үйлдэл санал болгохгүй', async ({ page }) => {
    await loginAsAdmin(page)
    const session = await createSession(page, 42)
    const cancelled = await page.request.post(`/api/admin/sessions/${session.id}/cancel`, {
      data: { reason: 'E2E урьдчилсан цуцлалт' },
    })
    expect(cancelled.status()).toBe(200)

    await page.goto('/admin/training?month=' + session.date.slice(0, 7))
    const row = page.locator('li').filter({ hasText: session.marker }).first()
    await row.getByRole('button', { name: /үйлдэл$/ }).click()

    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Дэлгэрэнгүй' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Устгах' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Цуцлах' })).toHaveCount(0)
    await expect(menu).toContainText('Энэ бэлтгэл цуцлагдсан')
  })

  // fill() нь бүх текстийг нэг үйлдлээр тавьдаг тул фокус алдагдах алдааг нуудаг.
  // Тиймээс энд заавал тэмдэгт тус бүрээр бичиж шалгана.
  test('Цуцлах шалтгааныг тэмдэгт тус бүрээр бичихэд фокус алдагдахгүй', async ({ page }) => {
    await loginAsAdmin(page)
    const session = await createSession(page, 43)

    await page.goto(`/admin/training/${session.id}`)
    await page.getByRole('button', { name: 'Цуцлах' }).click()

    const reason = page.getByLabel('Цуцлах шалтгаан')
    await reason.click()
    await reason.pressSequentially('Заал засварт орсон', { delay: 25 })
    await expect(reason).toHaveValue('Заал засварт орсон')
    await expect(reason).toBeFocused()

    await page.getByRole('dialog').getByRole('button', { name: 'Бэлтгэлийг цуцлах' }).click()
    await expect(page.getByText('Цуцлагдсан шалтгаан: Заал засварт орсон')).toBeVisible()
  })

  test('Сурагчийн формд тэмдэгт тус бүрээр бичихэд фокус алдагдахгүй', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/students')
    await page.getByRole('button', { name: 'Сурагч нэмэх' }).click()

    const name = page.getByLabel('Сурагчийн нэр')
    await name.click()
    await name.pressSequentially('Тестийн сурагч', { delay: 25 })
    await expect(name).toHaveValue('Тестийн сурагч')
    await expect(name).toBeFocused()
  })

  test('Нэг зэрэг зөвхөн нэг мөрийн цэс нээгдэнэ', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/training')

    const buttons = page.getByRole('button', { name: /үйлдэл$/ })
    const count = await buttons.count()
    test.skip(count < 2, 'Хоёроос доош бэлтгэлтэй бол шалгах боломжгүй')

    await buttons.nth(0).click()
    await expect(page.getByRole('menu')).toHaveCount(1)
    await buttons.nth(1).click()
    await expect(page.getByRole('menu')).toHaveCount(1)
  })
})
