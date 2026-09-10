import { test, expect } from '@playwright/test'

const PARENT_PHONE = process.env.E2E_PARENT_PHONE ?? '99112233'
const PARENT_CODE = process.env.E2E_PARENT_CODE ?? 'demo1234'

async function loginAsParent(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Утасны дугаар').fill(PARENT_PHONE)
  await page.getByLabel('Нууц код').fill(PARENT_CODE)
  await page.getByRole('button', { name: 'Нэвтрэх' }).click()
  await expect(page.getByText('Үлдсэн оролт')).toBeVisible()
}

test.describe('Эцэг эхийн үндсэн урсгал', () => {
  test('Нэвтэрч үлдсэн оролт, төлбөрийн төлөв харна', async ({ page }) => {
    await loginAsParent(page)
    await expect(page.getByText('эрх ашигласан')).toBeVisible()
    await expect(page.getByText(/сарын төлбөр$/)).toBeVisible()
  })

  test('Хоёр хүүхэдтэй эцэг эх хүүхдээ солиход мэдээлэл зөв шинэчлэгдэнэ', async ({ page }) => {
    await loginAsParent(page)

    const selector = page.getByRole('tablist', { name: 'Хүүхэд сонгох' })
    await expect(selector).toBeVisible()

    const tabs = selector.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThan(1)

    const firstName = (await tabs.nth(0).textContent())?.trim()
    const secondName = (await tabs.nth(1).textContent())?.trim()

    await tabs.nth(1).click()
    await expect(page).toHaveURL(/child=/)
    await expect(page.getByRole('heading', { name: secondName! })).toBeVisible()

    await tabs.nth(0).click()
    await expect(page.getByRole('heading', { name: firstName! })).toBeVisible()
  })

  test('Бусдын хүүхдийн мэдээлэлд хандах боломжгүй', async ({ page }) => {
    await loginAsParent(page)
    const response = await page.goto('/parent?child=00000000-0000-0000-0000-000000000000')
    expect(response?.status()).toBe(404)
  })

  test('Админы endpoint дуудахад сервер хориглоно', async ({ page }) => {
    await loginAsParent(page)
    const response = await page.request.get('/api/admin/students')
    expect(response.status()).toBe(403)
  })

  test('Ирц, төлбөрийн түүх нээгдэнэ', async ({ page }) => {
    await loginAsParent(page)

    await page.getByRole('link', { name: 'Бүх түүх' }).click()
    await expect(page.getByRole('heading', { name: 'Ирцийн түүх' })).toBeVisible()

    await page.goBack()
    await page.getByRole('link', { name: 'Түүх' }).first().click()
    await expect(page.getByText('Төлбөрийн түүх')).toBeVisible()
  })

  test('Админд зурвас илгээж, дахин ачаалахад хадгалагдана', async ({ page }) => {
    await loginAsParent(page)
    await page.getByRole('link', { name: 'Харилцаа' }).click()
    await page.getByRole('tab', { name: 'Зурвас' }).click()

    const text = `Тест зурвас ${Date.now()}`
    await page.getByLabel('Зурвас').fill(text)
    await page.getByRole('button', { name: 'Илгээх' }).click()
    await expect(page.getByText(text)).toBeVisible()

    await page.reload()
    await page.getByRole('tab', { name: 'Зурвас' }).click()
    await expect(page.getByText(text)).toBeVisible()
  })

  test('Нэвтрээгүй үед эцэг эхийн хуудас нээгдэхгүй', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/parent')
    await expect(page).toHaveURL(/\/login/)
  })
})
