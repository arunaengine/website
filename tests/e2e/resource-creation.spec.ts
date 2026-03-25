import { test, expect } from '@playwright/test'
import { createProjectTestData } from './helpers/data'

test('authenticated user can create a project resource', async ({ page }) => {
  const project = createProjectTestData()

  await page.goto('/')
  await expect(page).toHaveTitle('Aruna | The data orchestration engine')
  await expect(page.getByText('test-user')).toBeVisible()

  await page.goto('/user/resources')
  await expect(page.getByRole('link', { name: 'Create new resource' })).toBeVisible()

  await page.goto('/objects/create')

  await expect(page.getByRole('heading', { name: 'Resource creation' })).toBeVisible()
  await page.locator('#hs-validation-name-error').fill(project.name)
  await page.locator('#display-name-input').fill(project.title)
  await page.locator('#hs-textarea-ex-1').fill(project.description)

  const submitButton = page.getByRole('button', { name: 'Create Resource' })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  const modal = page.locator('#object-display')
  await expect(modal.getByText('Your Created Resource:')).toBeVisible()
  await expect(modal.getByText(project.name)).toBeVisible()
  await expect(modal.getByText(project.title)).toBeVisible()
  await expect(modal.locator('a[href^="/objects/"]')).toBeVisible()
})
