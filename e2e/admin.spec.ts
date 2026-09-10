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

test.describe('Админы үндсэн урсгал', () => {
  test('Нэвтэрч хяналтын самбар, сурагчдын жагсаалт харна', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByText('Идэвхтэй сурагч')).toBeVisible()
    await expect(page.getByText('Оролтын эрх 0 болсон')).toBeVisible()

    await page.goto('/admin/students')
    await expect(page.getByRole('heading', { level: 1, name: 'Сурагчид' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сурагч нэмэх' })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
  })

  test('Сурагчийн дэлгэрэнгүйг нээж хаахад шүүлтүүр хадгалагдана', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/students?status=active')

    const firstStudent = page.locator('table tbody tr').first().locator('a').first()
    const name = (await firstStudent.textContent())?.trim() ?? ''
    await firstStudent.click()

    await expect(page).toHaveURL(/student=/)
    const drawer = page.getByRole('dialog')
    await expect(drawer).toContainText(name)
    await expect(drawer.getByText('Нийт олгосон эрх').first()).toBeVisible()

    // Tab-ууд ажиллана
    await drawer.getByRole('tab', { name: 'Төлбөрийн түүх' }).click()
    await expect(drawer.getByRole('tab', { name: 'Төлбөрийн түүх' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await drawer.getByRole('button', { name: 'Хаах' }).first().click()
    await expect(page).toHaveURL(/status=active/)
    await expect(page).not.toHaveURL(/student=/)
  })

  test('Шинэ сурагч бүртгэхэд эцэг эхийн түр код нэг удаа харагдана', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/students')

    const unique = Date.now().toString().slice(-6)
    await page.getByRole('button', { name: 'Сурагч нэмэх' }).click()
    await page.getByLabel('Сурагчийн нэр').fill(`Тест сурагч ${unique}`)
    await page.getByLabel('Эцэг эхийн утас').fill(`99${unique}`)
    await page.getByRole('dialog').getByRole('button', { name: 'Бүртгэх', exact: true }).click()

    await expect(page.getByText('Түр нууц код')).toBeVisible()
    await page.getByRole('button', { name: 'Ойлголоо' }).click()

    await page.goto(`/admin/students?q=${unique}`)
    await expect(page.getByText(`Тест сурагч ${unique}`)).toBeVisible()
  })

  test('Сарын ирцийн хүснэгт бодит хуваариас багана үүсгэнэ', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance')

    await expect(page.getByRole('heading', { level: 1, name: 'Ирц' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Сурагчийн нэр' })).toBeVisible()
    await expect(page.getByText('Хамаарахгүй (жагсаалтад байгаагүй)')).toBeVisible()
  })

  test('Бэлтгэлийн ирц өөрчлөхөд хадгалагдаж, эрх зөв тооцогдоно', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/training')

    // Цуцлагдаагүй эхний бэлтгэлийг нээнэ
    await page
      .locator('ul li')
      .filter({ hasNotText: 'Цуцлагдсан' })
      .locator('a[href^="/admin/training/"]')
      .first()
      .click()
    await expect(page.getByRole('heading', { name: 'Ирц бүртгэх' })).toBeVisible()

    const row = page.locator('li').filter({ hasText: 'Үлдсэн эрх:' }).first()
    const group = row.getByRole('radiogroup')

    async function checkedLabel() {
      for (const label of ['Ирсэн', 'Тасалсан', 'Чөлөөтэй', 'Бүртгээгүй']) {
        const value = await group.getByRole('radio', { name: label }).getAttribute('aria-checked')
        if (value === 'true') return label
      }
      return 'Бүртгээгүй'
    }

    const original = await checkedLabel()
    const target = original === 'Чөлөөтэй' ? 'Тасалсан' : 'Чөлөөтэй'

    await group.getByRole('radio', { name: target }).click()
    await expect(row.getByText('Хадгалагдлаа')).toBeVisible()
    await expect(group.getByRole('radio', { name: target })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Дахин ачаалахад хадгалагдсан төлөв хэвээр
    await page.reload()
    const rowAfter = page.locator('li').filter({ hasText: 'Үлдсэн эрх:' }).first()
    await expect(
      rowAfter.getByRole('radiogroup').getByRole('radio', { name: target }),
    ).toHaveAttribute('aria-checked', 'true')

    // Анхны төлөв рүү нь буцаана
    if (original !== target) {
      await rowAfter.getByRole('radiogroup').getByRole('radio', { name: original }).click()
      await expect(rowAfter.getByText('Хадгалагдлаа')).toBeVisible()
    }
  })

  test('Төлбөрийн хуудас ачаалж, шинэ төлбөр бүртгэнэ', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/payments')
    await expect(page.getByRole('heading', { level: 1, name: 'Төлбөр' })).toBeVisible()

    await page.getByRole('button', { name: 'Төлбөр бүртгэх' }).click()
    await page.getByLabel('Төлсөн дүн (₮)').fill('120000')
    await page.getByLabel('Олгох оролтын тоо').fill('12')
    await page.getByRole('dialog').getByRole('button', { name: 'Бүртгэх', exact: true }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('table tbody tr').first()).toContainText('120,000 ₮')
  })
})
