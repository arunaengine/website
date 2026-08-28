import { chromium } from 'playwright-core'

// Compute / GA4GH TES portal flow.
//
// The `tes` feature now defaults ON (the facade is real, aruna #425), so the
// flag-off path in Section 1 requires the test stack to serve
// {"features":{"tes":false}}: the Compute surface must then be a no-op — no nav
// entry, honest disabled panels on the routes, and ZERO /ga4gh/tes/ requests.
//
// Section 2 exercises the flag-on happy path (list → submit wizard → detail
// drawer → cancel). The serving node must have a compute backend and explicitly
// advertise {"features":{"tes":true}}, so it is guarded by ARUNA_E2E_TES=1.

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
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(String(error)))
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

  if (!RUN_FLAG_ON) {
    // ── Section 1: flag-off no-op ────────────────────────────────────────────
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
      'compute run deep-link renders honest disabled panel',
      (await page.textContent('body')).includes('Compute is not enabled'),
    )

    step('no /ga4gh/tes/ request fired while flag off', tesRequests.length === 0, tesRequests.slice(0, 3).join(' | '))
  } else {
    // ── Section 2: flag-on happy path (needs a TES backend) ──────────────────
    await page.goto(BASE + '/app/compute')
    await page.waitForTimeout(1500)
    const listBody = await page.textContent('body')
    step(
      'compute list shows the run service line or the honest refusal panel',
      listBody.includes('Run service') || listBody.includes('does not accept runs'),
    )

    await page.getByRole('button', { name: /New run/ }).first().click()
    await page.getByText('Custom run', { exact: true }).first().click()
    await page.waitForURL(/\/app\/compute\/new/)
    await page.waitForTimeout(800)

    // Basics: name the run, describe it, and pick its owning group.
    await page.getByPlaceholder('align-and-count').fill('TES resource e2e')
    await page.locator('textarea').first().fill('Exercises the three-step run wizard.')
    await page.locator('[role="combobox"], button[aria-haspopup="listbox"]').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('option').first().click()
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Workload: one command line, one output capture, a workspace, and resources.
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await page.getByPlaceholder('ubuntu:22.04').fill('alpine:3.20')
    const commandLine = page.getByRole('textbox', { name: 'Command line' })
    await commandLine.fill('sh -c "echo hello > /outputs/result.txt"')
    await page.getByRole('textbox', { name: 'Container path to capture' }).fill('/outputs/result.txt')

    const outputBucket = page.locator('[aria-label="Destination bucket"]').first()
    if ((await outputBucket.evaluate((element) => element.tagName)) === 'INPUT') {
      await outputBucket.fill('e2e-results')
    } else {
      await outputBucket.click()
      await page.getByRole('option').first().click()
    }
    await page.getByRole('textbox', { name: 'Destination key' }).fill('tes-e2e/result.txt')
    await page.getByRole('button', { name: /^Temporary workspace/ }).click()

    await page.getByText('CPU cores', { exact: true }).locator('..').locator('input').fill('4')
    await page.getByText('RAM (GB)', { exact: true }).locator('..').locator('input').fill('8.5')
    await page.getByText('Disk (GB)', { exact: true }).locator('..').locator('input').fill('20.25')

    step(
      'single executor command-line editor shown',
      (await page.getByText('A run has exactly one executor.').count()) === 1,
    )
    await page.getByRole('button', { name: /^Continue$/ }).click()

    // Review replaces the Workload DOM and shows the exact pruned request JSON.
    await page.getByText('Run request', { exact: true }).waitFor()
    const reviewJson = (await page.locator('pre').filter({ hasText: '"resources"' }).textContent()) || ''
    step('Workload form replaced by Review', (await commandLine.count()) === 0)
    step(
      'Review JSON carries CPU, RAM, and Disk values',
      reviewJson.includes('"cpu_cores": 4') &&
        reviewJson.includes('"ram_gb": 8.5') &&
        reviewJson.includes('"disk_gb": 20.25'),
    )

    await page.getByRole('button', { name: /^Run$/ }).click()
    await page.waitForURL(/\/app\/compute\/[^/]+$/, { timeout: 20000 })
    await page.waitForTimeout(1500)
    const drawerBody = await page.textContent('body')
    step('run detail drawer opened after the run started', drawerBody.includes('Executors') || drawerBody.includes('Queued'))

    // Cancel two-step (state flips or a verbatim error renders).
    const cancelBtn = page.getByRole('button', { name: /^Cancel run$/ })
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
      step('cancel flips state or renders an error', true, 'run already terminal, cancel not offered')
    }
  }

  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 500/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
  step('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-tes-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
