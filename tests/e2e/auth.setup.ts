import { test as setup, expect } from '@playwright/test'
import { loginAsLocalUser } from './helpers/auth'

const authFile = 'playwright/.auth/regular-user.json'

setup('authenticate regular user', async ({ page }) => {
  await loginAsLocalUser(page)

  await page.goto('/user/resources')
  await expect(page.getByText('test-user')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create new resource' })).toBeVisible()

  await page.context().storageState({ path: authFile })
})
