import { test as setup, expect } from '@playwright/test'
import { loginAsLocalUser } from './helpers/auth'

const authFile = 'playwright/.auth/regular-user.json'

setup('authenticate regular user', async ({ page }) => {
  await loginAsLocalUser(page)

  await page.goto('/user/resources')
  await expect(page.getByRole('button', { name: /^test-user\b/ })).toBeVisible()

  const createResourceLink = page.locator('a[href="/objects/create"]').filter({ hasText: 'Create new resource' })
  await expect(createResourceLink).toBeVisible()
  await expect(createResourceLink).toHaveAttribute('href', '/objects/create')

  await page.context().storageState({ path: authFile })
})
