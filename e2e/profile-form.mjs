import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const RUN = Date.now().toString(36)
const PROFILE_NAME = `E2E Wizard Profile ${RUN}`
const PROFILE_SLUG = `e2e-wizard-profile-${RUN}`
const DATASET_TITLE = `E2E wizard dataset ${RUN}`
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
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

try {
  // Sign in as the realm admin — clicking Sign in redirects straight to Keycloak
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)

  // Build a profile with one MUST property rule ("Species") through the wizard.
  await page.goto(BASE + '/app/profiles')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'New profile' }).click()
  await page.waitForSelector('text=New metadata profile')
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('select').first().selectOption({ label: 'Genomics lab' })
  await dialog.getByPlaceholder('Proteomics Dataset Profile').fill(PROFILE_NAME)
  await dialog.getByPlaceholder('What this profile is for and who should use it.').fill('Profile created by the wizard E2E flow.')
  await dialog.getByRole('button', { name: /Next/ }).click()
  await page.waitForSelector('text=Add property rule')
  await dialog.getByRole('button', { name: /Add property rule/ }).click()
  await page.waitForTimeout(300)
  const labelInput = dialog.locator('input[placeholder="License"]').last()
  await labelInput.fill('Species')
  await labelInput.blur()
  await page.waitForTimeout(300)
  // Obligation Select options carry the RFC-2119 keyword as their value.
  await dialog.locator('select').last().selectOption('MUST')
  await page.waitForTimeout(300)
  await dialog.getByRole('button', { name: /Next/ }).click()
  await page.waitForSelector('text=Form preview')
  await dialog.getByRole('button', { name: /Create profile/ }).click()
  await page.waitForURL(new RegExp('/app/profiles/' + PROFILE_SLUG), { timeout: 20000 })
  await page.waitForTimeout(2500)
  step('profile created with a MUST rule', (await page.textContent('body')).includes('Species'), page.url())

  // Open the New dataset dialog and select the freshly built profile.
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'New dataset' }).first().click()
  await page.waitForSelector('text=New metadata document')
  const dsDialog = page.locator('[role="dialog"]')
  await dsDialog.locator('select').first().selectOption({ label: 'Genomics lab' })
  await dsDialog.getByPlaceholder('Dataset title').fill(DATASET_TITLE)
  await dsDialog.getByPlaceholder('datasets/my-dataset').fill('datasets/e2e-wizard-' + RUN)
  await dsDialog.locator('textarea').first().fill('Dataset created from the wizard E2E profile.')
  await dsDialog.locator('select').nth(1).selectOption(PROFILE_SLUG)
  await page.waitForTimeout(2500)
  step('profile-driven Species control renders', (await dsDialog.textContent()).includes('Species'))

  // Blocked: the MUST field is empty → live validation flags it and gates Create.
  const createButton = dsDialog.getByRole('button', { name: /Create metadata/ })
  step('create blocked while required field empty', await createButton.isDisabled())
  step('inline required error shown for the empty field', (await dsDialog.textContent()).includes('This field is required.'))

  // Fixed: fill Species → the error clears and Create enables.
  await dsDialog.locator('label', { hasText: 'Species' }).locator('..').locator('input').first().fill('Homo sapiens')
  await page.waitForTimeout(800)
  step('create enabled after filling the required field', !(await createButton.isDisabled()))
  await createButton.click()
  await page.waitForURL(/\/app\/metadata\//, { timeout: 20000 })
  await page.waitForTimeout(3000)
  step('dataset detail names the profile', (await page.textContent('body')).includes(PROFILE_NAME))

  // Detail view evaluates the stored crate against the profile → Conformant badge.
  step('conformance badge reads Conformant on the detail view', (await page.textContent('body')).includes('Conformant'))

  // Search: the card shows the compact conformance chip (crates now cached from
  // the detail visit). Lenient — the chip is icon-only, so accept its title text.
  await page.goto(BASE + '/app/search?q=' + encodeURIComponent(DATASET_TITLE))
  await page.waitForTimeout(2500)
  const card = page.getByRole('link', { name: new RegExp(DATASET_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
  const cardHtml = (await card.count()) ? await card.innerHTML() : ''
  step('search card shows a cached conformance chip', cardHtml.includes('Conformant'), 'lenient: title-attr presence')

  // Cleanup: delete the dataset (profiles have no UI delete; run-suffixed slugs
  // keep repeated runs from colliding).
  await page.goto(BASE + '/app/search?q=' + encodeURIComponent(DATASET_TITLE))
  await page.waitForTimeout(1500)
  await page.getByRole('link', { name: new RegExp(DATASET_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click()
  await page.waitForURL(/\/app\/metadata\//)
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^Delete$/ }).first().click()
  await page.waitForSelector('text=Delete metadata document')
  await page.locator('[role="dialog"]').getByRole('button', { name: /^Delete$/ }).click()
  await page.waitForURL(/\/app\/search/, { timeout: 15000 })
  step('dataset deleted', true)

  step('no console errors during the flow', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-profile-form-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
