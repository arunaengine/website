import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const RUN = Date.now().toString(36)
const PROFILE_NAME = `E2E Assay Profile ${RUN}`
const PROFILE_SLUG = `e2e-assay-profile-${RUN}`
const DATASET_TITLE = `E2E assay dataset ${RUN}`
const results = []
function step(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
})
const page = await browser.newPage()
page.setDefaultTimeout(15000)

try {
  // Sign in as the realm admin
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)

  // Create a profile: Basics -> Rules -> Review -> Create
  await page.goto(BASE + '/app/profiles')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'New profile' }).click()
  await page.waitForSelector('text=New metadata profile')
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('select').first().selectOption({ label: 'Genomics lab' })
  await dialog.getByPlaceholder('Proteomics Dataset Profile').fill(PROFILE_NAME)
  await dialog.getByPlaceholder('What this profile is for and who should use it.').fill('Profile created by the portal E2E flow.')
  // Version / date / license are prefilled; the slug derives from the name.
  await dialog.getByRole('button', { name: /Next/ }).click()
  await page.waitForSelector('text=Add property rule')
  // One custom MUST-able rule so the dataset dialog demonstrably renders a
  // profile-driven control. The label blur derives the term name assayType.
  await dialog.getByRole('button', { name: /Add property rule/ }).click()
  await page.waitForTimeout(300)
  const labelInput = dialog.locator('input[placeholder="License"]').last()
  await labelInput.fill('Assay type')
  await labelInput.blur()
  await page.waitForTimeout(300)
  await dialog.getByRole('button', { name: /Next/ }).click()
  await page.waitForSelector('text=Form preview')
  await dialog.getByRole('button', { name: /Create profile/ }).click()
  await page.waitForURL(new RegExp('/app/profiles/' + PROFILE_SLUG), { timeout: 20000 })
  await page.waitForTimeout(3000)
  const profileBody = await page.textContent('body')
  step('profile created and detail page renders its rules', profileBody.includes('Assay type'), page.url())
  step('profile export affordance present', profileBody.includes('Download profile crate'))

  // The stored document behind the profile renders as a crate in the catalog
  await page.getByRole('link', { name: /Catalog record/ }).click()
  await page.waitForURL(/\/app\/metadata\//)
  await page.waitForTimeout(2500)
  const docBody = await page.textContent('body')
  step('catalog detail flags the profile document', docBody.includes('This document is a metadata profile'))
  step('profile crate artifacts listed as parts', docBody.includes('mode.json') || docBody.includes('Editor Mode File'))

  // Use the profile in a new dataset
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'New dataset' }).first().click()
  await page.waitForSelector('text=New metadata document')
  const dsDialog = page.locator('[role="dialog"]')
  await dsDialog.locator('select').first().selectOption({ label: 'Genomics lab' })
  await dsDialog.locator('select').nth(1).selectOption(PROFILE_SLUG)
  await page.waitForTimeout(2500)
  step('profile-driven control renders in the dataset dialog', (await dsDialog.textContent()).includes('Assay type'))
  await dsDialog.getByPlaceholder('Dataset title').fill(DATASET_TITLE)
  await dsDialog.getByPlaceholder('datasets/my-dataset').fill('datasets/e2e-assay-' + RUN)
  await dsDialog.locator('textarea').first().fill('Dataset created from the E2E profile.')
  await dsDialog.locator('label', { hasText: 'Assay type' }).locator('..').locator('input').first().fill('LC-MS')
  await dsDialog.getByRole('button', { name: /Create metadata/ }).click()
  await page.waitForURL(/\/app\/metadata\//, { timeout: 20000 })
  await page.waitForTimeout(2500)
  const detailBody = await page.textContent('body')
  step('dataset detail names the profile', detailBody.includes(PROFILE_NAME))

  // The stored crate round-trips the profile conformance and the custom term
  await page.getByRole('button', { name: /RO-Crate JSON-LD/ }).click()
  await page.waitForTimeout(2000)
  const crateText = await page.textContent('body')
  step('dataset crate carries conformsTo', crateText.includes('conformsTo'))
  step('dataset crate carries the profile-driven value', crateText.includes('assayType') && crateText.includes('LC-MS'))

  // Cleanup: delete the dataset (profiles have no UI delete; the run-suffixed
  // slug keeps repeated runs from colliding).
  await page.getByRole('button', { name: /^Delete$/ }).first().click()
  await page.waitForSelector('text=Delete metadata document')
  await page.locator('[role="dialog"]').getByRole('button', { name: /^Delete$/ }).click()
  await page.waitForURL(/\/app\/search/, { timeout: 15000 })
  step('dataset deleted', true)
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-profile-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
