import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@volleyball.mn'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!'
const PARENT_PHONE = process.env.E2E_PARENT_PHONE ?? '99112233'
const PARENT_CODE = process.env.E2E_PARENT_CODE ?? 'demo1234'

async function parentLogin(page: Page, phone: string, code: string) {
  await page.goto('/login')
  await page.getByLabel('Утасны дугаар').fill(phone)
  await page.getByLabel('Нууц код').fill(code)
  await page.getByRole('button', { name: 'Нэвтрэх' }).click()
}

async function changeCode(page: Page, current: string, next: string) {
  await page.getByLabel('Одоогийн код').fill(current)
  await page.getByLabel('Шинэ нууц код').fill(next)
  await page.getByLabel('Шинэ кодоо давтах').fill(next)
  await page.getByRole('button', { name: 'Кодоо солих' }).click()
}

test.describe('Нэвтрэлт ба session', () => {
  test('Түр код → эхний нэвтрэлтэд солих → хуучин session хүчингүй болох', async ({ browser }) => {
    // 1. Админ шинэ сурагч бүртгэж түр код авна (тусад нь тусгаарлагдсан өгөгдөл)
    const adminContext = await browser.newContext()
    const admin = await adminContext.newPage()
    await admin.goto('/admin/login')
    await admin.getByLabel('И-мэйл').fill(ADMIN_EMAIL)
    await admin.getByLabel('Нууц үг').fill(ADMIN_PASSWORD)
    await admin.getByRole('button', { name: 'Нэвтрэх' }).click()
    await expect(admin.getByRole('heading', { level: 1, name: 'Хяналтын самбар' })).toBeVisible()

    const unique = Date.now().toString().slice(-6)
    const phone = `95${unique}`
    const created = await admin.request.post('/api/admin/students', {
      data: {
        fullName: `Session тест ${unique}`,
        registeredAt: new Date().toISOString().slice(0, 10),
        groupId: null,
        parentPhone: phone,
      },
    })
    expect(created.status()).toBe(201)
    const { temporaryCode } = await created.json()
    expect(temporaryCode).toBeTruthy()

    // 2. Түр кодоор нэвтрэхэд кодоо солихыг шаардана
    const deviceA = await browser.newContext()
    const pageA = await deviceA.newPage()
    await parentLogin(pageA, phone, temporaryCode)
    await expect(pageA).toHaveURL(/\/set-code/)

    const firstCode = `code-a-${unique}`
    await changeCode(pageA, temporaryCode, firstCode)
    await expect(pageA.getByText('Үлдсэн оролт')).toBeVisible()

    // 3. Хоёр дахь төхөөрөмжөөс шинэ кодоор нэвтэрнэ
    const deviceB = await browser.newContext()
    const pageB = await deviceB.newPage()
    await parentLogin(pageB, phone, firstCode)
    await expect(pageB.getByText('Үлдсэн оролт')).toBeVisible()

    // 4. A төхөөрөмж кодоо дахин солиход B-ийн session хүчингүй болно
    const secondCode = `code-b-${unique}`
    await pageA.goto('/parent/profile')
    await changeCode(pageA, firstCode, secondCode)
    await expect(pageA.getByText('Нууц код амжилттай солигдлоо.')).toBeVisible()

    await pageB.goto('/parent')
    await expect(pageB).toHaveURL(/\/login/)

    // 5. Хуучин код ажиллахгүй, шинэ код ажиллана
    await parentLogin(pageB, phone, firstCode)
    await expect(pageB.getByRole('alert').first()).toContainText('буруу байна')

    await parentLogin(pageB, phone, secondCode)
    await expect(pageB.getByText('Үлдсэн оролт')).toBeVisible()

    await adminContext.close()
    await deviceA.close()
    await deviceB.close()
  })

  test('Буруу нэвтрэлт дугаар бүртгэлтэй эсэхийг задруулахгүй', async ({ page }) => {
    // Rate limit-д нөлөөлөхгүйн тулд ажиллуулалт бүрд өөр дугаар
    const unknownPhone = `9${Date.now().toString().slice(-7)}`
    await parentLogin(page, unknownPhone, 'buruu-kod')
    await expect(page.getByRole('alert').first()).toContainText(
      'Утасны дугаар эсвэл нууц код буруу байна',
    )
  })

  test('Эцэг эх админ хуудсанд нэвтэрч чадахгүй', async ({ page }) => {
    await parentLogin(page, PARENT_PHONE, PARENT_CODE)
    await expect(page.getByText('Үлдсэн оролт')).toBeVisible()

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/parent/)
  })

  test('Админ эцэг эхийн порталд орохгүй', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel('И-мэйл').fill(ADMIN_EMAIL)
    await page.getByLabel('Нууц үг').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Нэвтрэх' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Хяналтын самбар' })).toBeVisible()

    await page.goto('/parent')
    await expect(page).toHaveURL(/\/admin/)
  })

  test('Нэвтрээгүй үед бүх хамгаалалттай хуудас нэвтрэх рүү чиглүүлнэ', async ({ page }) => {
    for (const path of ['/admin', '/admin/students', '/parent', '/parent/profile']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/(admin\/)?login/)
    }
  })
})
