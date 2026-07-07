import { chromium } from 'playwright-core'

// User device enrollment E2E (aruna#271). Requires a backend implementing the
// aruna#271 self-service device endpoints (gated on the aruna#272 security
// guard) AND a portal-config.json serving {"features":{"deviceEnrollment":true}}.
// Failing by design until both exist; it must stay syntactically valid ESM
// (checked in CI via `node --check`).
//
// Env:
//   ARUNA_PORTAL_BASE      portal origin (default http://localhost:5173)
//   ARUNA_E2E_DEVICE_CAP   when set (e.g. 1), also assert the cap-reached copy
//                          and the disabled enroll button.

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const CAP = process.env.ARUNA_E2E_DEVICE_CAP
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

// The known API projection-race 500 on GET /metadata is retried and recovered by
// the portal; tolerate only that, like data-flows.mjs.
const tolerated = (e) => /Failed to load resource: the server responded with a status of 500/.test(e)

try {
  // Sign in as the realm admin — same Keycloak block as data-flows.
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)
  step('user signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // With the flag ON, Settings surfaces the "My devices" cross-link.
  await page.goto(BASE + '/app/settings')
  await page.waitForTimeout(1200)
  const devicesLink = page.getByRole('link', { name: /My devices/ })
  step('settings shows the My devices link', (await devicesLink.count()) >= 1)
  await devicesLink.first().click()
  await page.waitForURL(/\/app\/settings\/devices/)
  await page.waitForTimeout(1200)
  step('devices view renders', (await page.textContent('body')).includes('My devices'))

  // Step 1 — the single "User device" card carries the trust copy.
  await page.getByRole('radio', { name: /User device/ }).click()
  await page.waitForTimeout(200)
  step('user device card shows the trust copy', (await page.textContent('body')).includes('never mints tokens'))
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.waitForTimeout(400)

  // Step 2 — name the device, open Advanced, pick a 10-minute expiry, enroll.
  await page.getByPlaceholder('e.g. work-laptop').fill('e2e-laptop')
  await page.getByRole('button', { name: /^Advanced$/ }).click()
  await page.waitForTimeout(200)
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: '10 minutes' }).click()
  await page.getByRole('button', { name: /Enroll device/ }).click()
  await page.waitForTimeout(2000)
  const tokenBody = await page.textContent('body')
  step('device token panel shows the shown-once notice', tokenBody.includes('shown once'))
  step('device token panel labels the token', /Device token/i.test(tokenBody))
  step('a mono token value is rendered', (await page.locator('.font-mono').count()) >= 1)

  // Step 3 — the generated .env embeds the token and the slugged device label.
  await page.getByRole('button', { name: /Continue to configuration/ }).click()
  await page.waitForTimeout(600)
  const cfgBody = await page.textContent('body')
  step('env snippet contains ONBOARDING_SECRET=', cfgBody.includes('ONBOARDING_SECRET='))
  step('env snippet labels the device', cfgBody.includes('ARUNA_NODE_LABELS=device=e2e-laptop'))

  // Step 4 — watch: the claim stage is active with a spinner until the device claims.
  await page.getByRole('button', { name: /Watch it connect/ }).click()
  await page.waitForTimeout(800)
  const watchBody = await page.textContent('body')
  step('watch step shows the claim stage', watchBody.includes('Device claimed'))
  step('watch step spins while pending', (await page.locator('.animate-spin').count()) >= 1)

  // The device table gained a pending-claim row for the new enrollment.
  const table = page.locator('table')
  step('device table lists a pending device', (await table.getByText(/pending claim/i).count()) >= 1)

  // Evict via the inline two-step confirm; the row disappears.
  await table.getByRole('button', { name: /^Evict$/ }).first().click()
  await page.getByRole('button', { name: /Confirm evict/ }).click()
  await page.waitForTimeout(1500)
  step(
    'device evicted and row removed',
    (await table.getByRole('button', { name: /^Evict$/ }).count()) === 0 ||
      (await page.textContent('body')).includes('No devices enrolled yet'),
  )

  // Optional cap assertion: enroll until the realm per-user cap is hit, then the
  // enroll button is disabled and the honest cap copy renders.
  if (CAP) {
    await page.getByRole('button', { name: /Enroll another|Enroll one above|Refresh/ }).first().click().catch(() => {})
    await page.waitForTimeout(500)
    const capBody = await page.textContent('body')
    step('cap-reached copy renders when the per-user limit is hit', capBody.includes('Device limit reached'))
    const enrollBtn = page.getByRole('button', { name: /Enroll device/ })
    step('enroll button disabled at the cap', (await enrollBtn.count()) === 0 || (await enrollBtn.first().isDisabled()))
  }

  const unexpected = consoleErrors.filter((e) => !tolerated(e))
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-user-devices-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
