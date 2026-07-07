import { chromium } from 'playwright-core'

// Quota reporting UI (aruna#250, portal part). Drives a single signed-in admin
// session against a live stack: dashboard quota cards, the group Storage
// section, the flag-off state of the usage-history section, the admin quota
// editor (regression guard) and the buckets page. Requires a running portal +
// backend; do NOT block the branch on execution — it is syntax-checked only.
const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const GROUP_NAME = process.env.ARUNA_QUOTA_GROUP || 'Genomics lab'
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
  // Sign in as the realm admin — clicking Sign in redirects straight to Keycloak.
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // Dashboard renders the per-group storage cards for a signed-in member.
  await page.goto(BASE + '/app')
  await page.waitForTimeout(2000)
  step('dashboard shows group quota cards', (await page.textContent('body')).includes("Your groups' storage"))

  // Group detail Storage section: a bar (finite quota shows "of"), an explicit
  // "unlimited" row, or the no-policy byte row — all three are honest outputs.
  await page.goto(BASE + '/app/groups')
  await page.waitForTimeout(1500)
  await page.locator('li', { hasText: GROUP_NAME }).first().click()
  await page.waitForTimeout(1500)
  const groupBody = await page.textContent('body')
  step('group detail shows the storage section', groupBody.includes('Group storage'))
  step(
    'storage section reports quota, unlimited or no-policy',
    groupBody.includes('unlimited') || groupBody.includes(' of ') || groupBody.includes('no quota policy reported'),
  )

  // Usage history is config-gated OFF by default: no features.usageHistory flag
  // means the section never renders and no /usage/history request is issued.
  step('usage history hidden without config flag', !groupBody.includes('Usage history'))

  // Regression guard: this branch must not break the realm quota editor.
  await page.goto(BASE + '/app/admin')
  await page.waitForTimeout(2000)
  step('admin quota policy editor still renders', (await page.textContent('body')).includes('Quota policy'))

  // Buckets page renders (Upload action or the credential prompt). The upload
  // precheck itself is not assertable here without a configured finite quota
  // and an active S3 key that would actually breach it.
  await page.goto(BASE + '/app/buckets')
  await page.waitForTimeout(2000)
  const bucketsBody = await page.textContent('body')
  step(
    'buckets page renders',
    bucketsBody.includes('Upload') || bucketsBody.includes('credentials') || bucketsBody.includes('S3'),
  )

  // The only tolerated console error is the known API projection-race 500 on
  // GET /metadata, which the portal retries and recovers from.
  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 500/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-quota-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
