import { test, expect } from '@playwright/test'
import { createProjectTestData } from './helpers/data'

test('authenticated user can create a project resource', async ({ page }) => {
  const project = createProjectTestData()

  await test.step('open the authenticated home page', async () => {
    await page.goto('/')
    await expect(page).toHaveTitle('Aruna | The data orchestration engine')
    await expect(page.getByRole('button', { name: /^test-user\b/ })).toBeVisible()
  })

  await test.step('navigate to the resources page from the user menu', async () => {
    const userMenuTrigger = page.getByRole('button', { name: /^test-user\b/ })
    await userMenuTrigger.click()

    const resourcesLink = page.locator('a[href="/user/resources"]').filter({ hasText: 'Resources' })
    await expect(resourcesLink).toBeVisible()
    await resourcesLink.click()
    await expect(page).toHaveURL(/\/user\/resources(?:\?.*)?$/)
  })

  await test.step('open the resource creation form from the resources page', async () => {
    const createResourceLink = page.locator('a[href="/objects/create"]').filter({ hasText: 'Create new resource' })
    await expect(createResourceLink).toBeVisible()
    await expect(createResourceLink).toHaveAttribute('href', '/objects/create')
    await createResourceLink.scrollIntoViewIfNeeded()
    await createResourceLink.click()
    await expect(page).toHaveURL(/\/objects\/create(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'Resource creation' })).toBeVisible()
    await expect(page.getByTestId('resource-creation-form')).toBeVisible()
  })

  await test.step('fill and submit the project creation form', async () => {
    const creationForm = page.getByTestId('resource-creation-form')

    await creationForm.getByTestId('resource-name-input').fill(project.name)
    await creationForm.getByTestId('resource-title-input').fill(project.title)
    await creationForm.getByTestId('resource-description-input').fill(project.description)

    const submitButton = page.getByTestId('resource-create-button')
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
  })

  await test.step('verify the created resource dialog contents', async () => {
    const dialog = page.getByRole('dialog', { name: 'Created resource details' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Your Created Resource:')).toBeVisible()
    await expect(dialog.getByText(project.name)).toBeVisible()
    await expect(dialog.getByText(project.title)).toBeVisible()

    const resourceLink = dialog.getByTestId('created-resource-link')
    await expect(resourceLink).toBeVisible()
    await expect(resourceLink).toHaveAttribute('href', /\/objects\/[A-Z0-9]+/)
  })
})
