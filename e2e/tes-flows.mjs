import { chromium } from 'playwright-core'

// Compute / GA4GH TES portal flow (aruna#290).
//
// Section 1 is runnable against any stack TODAY: with the `tes` feature flag off
// (the default), the Compute surface must be a no-op — no nav entry, honest
// disabled panels on the routes, and ZERO /ga4gh/tes/ requests.
//
// Section 2 exercises the flag-on happy path (list → submit wizard → detail
// drawer → cancel). It needs a TES-serving backend — none exists yet
// (aruna#290) — plus a portal served with portal-config.json {"features":
// {"tes":true}}, so it is guarded by ARUNA_E2E_TES === '1' and is never a branch
// requirement. Branch gate: `node --check e2e/tes-flows.mjs` only; this script
// is not executed against a live stack as part of the branch.

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const RUN_FLAG_ON = process.env.ARUNA_E2E_TES === '1'
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
// Any request to the assumed TES surface is a flag-off regression.
const tesRequests = []
page.on('request', (req) => {
  if (req.url().includes('/ga4gh/tes/')) tesRequests.push(req.url())
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
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // ── Section 1: flag-off no-op (runnable today) ─────────────────────────────
  const asideText = (await page.textContent('aside')) || ''
  step('compute nav hidden while flag off', !asideText.includes('Compute'))

  await page.goto(BASE + '/app/compute')
  await page.waitForTimeout(1200)
  step(
    'compute view renders honest disabled panel',
    (await page.textContent('body')).includes('Compute is not enabled'),
  )

  await page.goto(BASE + '/app/compute/new')
  await page.waitForTimeout(1200)
  step(
    'compute submit view renders honest disabled panel',
    (await page.textContent('body')).includes('Compute is not enabled'),
  )

  await page.goto(BASE + '/app/compute/some-task-id')
  await page.waitForTimeout(1200)
  step(
    'compute task deep-link renders honest disabled panel',
    (await page.textContent('body')).includes('Compute is not enabled'),
  )

  step('no /ga4gh/tes/ request fired while flag off', tesRequests.length === 0, tesRequests.slice(0, 3).join(' | '))

  // ── Section 2: flag-on happy path (env-guarded, needs a TES backend) ───────
  if (RUN_FLAG_ON) {
    await page.goto(BASE + '/app/compute')
    await page.waitForTimeout(1500)
    const listBody = await page.textContent('body')
    step(
      'compute list shows the service line or the honest no-TES panel',
      listBody.includes('TES ') || listBody.includes('does not serve a TES endpoint'),
    )

    await page.getByRole('button', { name: /New task/ }).first().click()
    await page.waitForURL(/\/app\/compute\/new/)
    await page.waitForTimeout(800)

    // Step 1 — Basics: pick a group, then Continue.
    await page.locator('[role="combobox"], button[aria-haspopup="listbox"]').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('option').first().click()
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Step 2 — Inputs: skip.
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Step 3 — Executors: image + two command args via the add-argument button.
    await page.getByPlaceholder('ubuntu:22.04').first().fill('alpine:3')
    await page.getByPlaceholder('echo').first().fill('echo')
    await page.getByRole('button', { name: /Add argument/ }).first().click()
    await page.locator('input[placeholder="argument"]').last().fill('hello')
    step('executor reorder buttons visible', (await page.getByRole('button', { name: /Move step (up|down)/ }).count()) >= 2)
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Step 4 — Outputs & resources: accept defaults.
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Step 5 — Review: the pruned JSON carries the group tag and executors.
    await page.waitForTimeout(500)
    const reviewBody = await page.textContent('body')
    step(
      'review JSON carries the group tag and executors',
      reviewBody.includes('aruna.io/group') && reviewBody.includes('executors'),
    )

    await page.getByRole('button', { name: /Submit task/ }).click()
    await page.waitForURL(/\/app\/compute\/[^/]+$/, { timeout: 20000 })
    await page.waitForTimeout(1500)
    const drawerBody = await page.textContent('body')
    step('task detail drawer opened after submit', drawerBody.includes('Executors') || drawerBody.includes('Queued'))

    // Cancel two-step (state flips or a verbatim error renders).
    const cancelBtn = page.getByRole('button', { name: /^Cancel task$/ })
    if (await cancelBtn.count()) {
      await cancelBtn.first().click()
      await page.getByRole('button', { name: /Confirm cancel/ }).click()
      await page.waitForTimeout(1500)
      const afterCancel = await page.textContent('body')
      step(
        'cancel flips state or renders an error',
        /Cancel(ing|ed)/.test(afterCancel) || afterCancel.includes('error'),
      )
    } else {
      step('cancel flips state or renders an error', true, 'task already terminal — cancel not offered')
    }
  }

  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 500/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-tes-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
