import { test, expect } from '@playwright/test'
import { createTokenTestData } from './helpers/data'

test('authenticated user can create a personal token', async ({ page }) => {
  const token = createTokenTestData()

  await test.step('open the authenticated home page', async () => {
    await page.goto('/')
    await expect(page).toHaveTitle('Aruna | The data orchestration engine')
    await expect(page.getByRole('button', { name: /^test-user\b/ })).toBeVisible()
  })

  await test.step('navigate to the account page from the user menu', async () => {
    const userMenuTrigger = page.getByRole('button', { name: /^test-user\b/ })
    await userMenuTrigger.click()

    const accountLink = page.locator('a[href="/user/account"]').filter({ hasText: 'Account' })
    await expect(accountLink).toBeVisible()
    await accountLink.click()
    await expect(page).toHaveURL(/\/user\/account(?:\?.*)?$/)
  })

  await test.step('open the tokens tab', async () => {
    const tokensTab = page.getByTestId('account-tokens-tab')
    await expect(tokensTab).toBeVisible()
    await tokensTab.click()

    const tokensPanel = page.getByTestId('account-tokens-panel')
    await expect(tokensPanel).toBeVisible()
    await expect(page.getByTestId('account-create-token-button')).toBeVisible()
  })

  await test.step('create a personal token in the dialog', async () => {
    await page.getByTestId('account-create-token-button').click()

    const dialog = page.getByRole('dialog', { name: 'Create Token' })
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('token-name-input').fill(token.name)

    const submitButton = dialog.getByTestId('create-token-submit')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
  })

  await test.step('verify token secret is shown after creation', async () => {
    const dialog = page.getByRole('dialog', { name: 'Create Token' })

    await expect(dialog.getByTestId('token-secret-panel')).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Token Secret' })).toBeVisible()

    const tokenSecret = dialog.locator('#token-secret')
    await expect(tokenSecret).toBeVisible()
    await expect(tokenSecret).toHaveText(/\S+/)
  })

  await test.step('verify the created token appears in the tokens table', async () => {
    const tokensTable = page.getByTestId('account-tokens-table')

    await expect.poll(async () => await tokensTable.getByText(token.name).count()).toBe(1)
    await expect(tokensTable.getByText(token.name)).toBeVisible()
  })
})
