import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

const regularUser = {
  username: process.env.E2E_USERNAME ?? 'regular',
  password: process.env.E2E_PASSWORD ?? 'regular',
}

export async function loginAsLocalUser(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page).toHaveTitle('Aruna | The data orchestration engine')

  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByText('Continue login with')).toBeVisible()
  await page.getByRole('link', { name: 'Local Test Login' }).click()

  await expect(page).toHaveURL(/localhost:1998/)

  const usernameField = page.locator('#username, input[name="username"], input[type="text"]').first()
  const passwordField = page.locator('#password, input[name="password"], input[type="password"]').first()
  const submitButton = page.locator('#kc-login, button[type="submit"], input[type="submit"]').first()

  await usernameField.fill(regularUser.username)
  await passwordField.fill(regularUser.password)
  await submitButton.click()

  await expect(page).toHaveURL('http://localhost:3000/')
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies('http://localhost:3000')
      return cookies.some(cookie => cookie.name === 'access_token')
    })
    .toBe(true)
}
