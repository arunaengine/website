import { chromium } from 'playwright-core'

// Node onboarding wizard E2E (aruna#277). Syntax-checked in CI (node --check);
// run against a two-node cluster where the portal is served from every node's
// REST port: `just preview <portal-dist> 2`
// (== scripts/local_cluster_deploy.sh --with-keycloak --node-count 2
// --auto-portal-dir). Node 1 is the management node that mints secrets; node 2
// is the joiner and exercises the non-management 403 explainer honestly.
//
// Env:
//   ARUNA_PORTAL_BASE     portal origin of node 1 (default http://localhost:5173)
//   ARUNA_E2E_NODE2_PORT  node 2 REST port (default 43011 = BASE_PORT 43000 + 10 + 1)

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const NODE2_PORT = process.env.ARUNA_E2E_NODE2_PORT || '43011'
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

// The known API projection-race 500 on GET /metadata is retried and recovered
// by the portal; tolerate only that, like data-flows.mjs.
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
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // The realm admin sees the Onboarding entry in the sidebar.
  step('sidebar shows the Onboarding entry', (await page.getByRole('link', { name: 'Onboarding' }).count()) >= 1)

  // The onboarding view renders on a management node.
  await page.goto(BASE + '/app/admin/onboarding')
  await page.waitForTimeout(1500)
  step('onboarding view renders', (await page.textContent('body')).includes('Node onboarding'))

  // Step 1 — pick the Local card and assert the mandated admin-claim warning.
  await page.getByRole('radio', { name: /Local/ }).click()
  await page.waitForTimeout(300)
  step('local card shows the admin-claim warning', (await page.textContent('body')).includes('redeemed once at sign-up'))
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.waitForTimeout(400)

  // Step 2 — mint with a 10-minute expiry (seed URL is prefilled).
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: '10 minutes' }).click()
  await page.getByRole('button', { name: /Mint secret/ }).click()
  await page.waitForTimeout(2000)
  const mintBody = await page.textContent('body')
  step('secret panel shows the shown-once notice', mintBody.includes('shown once'))
  step('secret panel labels the onboarding secret', /Onboarding secret/i.test(mintBody))

  // Step 3 — generated config carries the verified env keys.
  await page.getByRole('button', { name: /Continue to configuration/ }).click()
  await page.waitForTimeout(600)
  const cfgBody = await page.textContent('body')
  step('env snippet contains ONBOARDING_SECRET=', cfgBody.includes('ONBOARDING_SECRET='))
  step('compose snippet contains network_mode: host', cfgBody.includes('network_mode: host'))

  // Outstanding table gained the freshly minted Local secret.
  const table = page.locator('table')
  step('outstanding table lists a Local secret', (await table.getByText('Local').count()) >= 1)

  // Revoke it via the inline two-step confirm; the row disappears.
  await table.getByRole('button', { name: /^Revoke$/ }).first().click()
  await page.getByRole('button', { name: /Confirm revoke/ }).click()
  await page.waitForTimeout(1500)
  const afterRevoke = await page.textContent('body')
  step(
    'secret revoked and row removed',
    (await table.getByRole('button', { name: /^Revoke$/ }).count()) === 0 ||
      afterRevoke.includes('No outstanding onboarding secrets'),
  )

  // Non-management node: point the API base at node 2 and reload. The wizard is
  // replaced by the management-node explainer and no unexpected console error
  // fires (the non-management path makes no onboarding API call).
  const errorsBefore = consoleErrors.length
  await page.evaluate((port) => localStorage.setItem('aruna.apiBaseUrl', `http://127.0.0.1:${port}/api/v1`), NODE2_PORT)
  await page.reload()
  await page.waitForTimeout(2500)
  step('non-management node shows the management explainer', (await page.textContent('body')).includes('management node'))
  const newErrors = consoleErrors.slice(errorsBefore).filter((e) => !tolerated(e))
  step('no unexpected console errors on the non-management path', newErrors.length === 0, newErrors.slice(0, 3).join(' | '))

  // Restore the default API base for any later run.
  await page.evaluate(() => localStorage.removeItem('aruna.apiBaseUrl'))
  await page.reload()
  await page.waitForTimeout(1500)

  const unexpected = consoleErrors.filter((e) => !tolerated(e))
  step('no unexpected console errors overall', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-onboarding-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
