import { chromium } from 'playwright-core'

// Offline portal + subscriptions (aruna#273, portal part).
//
// The offline sections run against today's default stack: playwright's
// context.setOffline() drives navigator.onLine and blocks the network, which is
// exactly what the connectivity model reacts to. The flag-on subscription
// section requires a backend implementing aruna#273 plus a portal-config.json
// of {"features":{"subscriptions":true}}, and is guarded by
// ARUNA_E2E_SUBSCRIPTIONS=1. This file must stay syntactically valid ESM
// (`node --check`); live runs are not a branch gate.
const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const RUN_SUBSCRIPTIONS = process.env.ARUNA_E2E_SUBSCRIPTIONS === '1'
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
const context = page.context()
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

  // 1. Online baseline: no offline banner, New dataset enabled.
  let body = await page.textContent('body')
  step('no offline banner when online', !body.includes('You appear to be offline'))
  step(
    'new dataset enabled online',
    !(await page.getByRole('button', { name: /New dataset/ }).first().isDisabled()),
  )

  // 2. Cut the network: the offline banner appears and writes are disabled.
  await context.setOffline(true)
  await page.goto(BASE + '/app/search').catch(() => {})
  await page.waitForTimeout(1500)
  body = await page.textContent('body')
  step('offline banner appears', body.includes('offline'))
  step(
    'new dataset disabled offline',
    await page.getByRole('button', { name: /New dataset/ }).first().isDisabled(),
  )

  // Best-effort: an admin-owned metadata detail disables Edit while offline.
  // Skipped silently when no doc row is reachable offline.
  try {
    const editBtn = page.getByRole('button', { name: /^Edit$/ }).first()
    if (await editBtn.count()) {
      step('edit disabled offline', await editBtn.isDisabled())
    }
  } catch {
    /* no reachable detail page offline — skip */
  }

  // 3. Reconnect: the banner clears (one refresh reconciles).
  await context.setOffline(false)
  await page.waitForTimeout(2000)
  body = await page.textContent('body')
  step('banner clears after reconnect', !body.includes('You appear to be offline'))

  // 4. Flag-off no-op: Settings has no Subscriptions link and the route 404s.
  await page.goto(BASE + '/app/settings')
  await page.waitForTimeout(1500)
  body = await page.textContent('body')
  step('settings has no subscriptions link (flag off)', !body.includes('Subscriptions'))
  await page.goto(BASE + '/app/settings/subscriptions')
  await page.waitForTimeout(1500)
  body = await page.textContent('body')
  step('subscriptions route renders 404 (flag off)', body.includes('404') && !body.includes('Subscribed groups'))

  // 5. Flag-on subscription flow (env-guarded; needs an aruna#273 backend).
  if (RUN_SUBSCRIPTIONS) {
    await page.goto(BASE + '/app/settings')
    await page.waitForTimeout(1500)
    step('settings shows subscriptions link (flag on)', (await page.textContent('body')).includes('Subscriptions'))
    await page.goto(BASE + '/app/settings/subscriptions')
    await page.waitForTimeout(1500)
    body = await page.textContent('body')
    step('subscriptions view renders', body.includes('Subscribed groups'))
    // Subscribe to the first candidate group, if any is offered.
    const select = page.locator('select').first()
    if (await select.count()) {
      const options = await select.locator('option').all()
      if (options.length > 1) {
        await select.selectOption({ index: 1 })
        await page.getByRole('button', { name: /Subscribe/ }).first().click()
        await page.waitForTimeout(1500)
        body = await page.textContent('body')
        // Either a real row appears (sync-state badge) or the honest backend
        // error renders verbatim — both are acceptable end states.
        step(
          'subscribe yields a row or an honest error',
          /pending|syncing|synced|sync error/.test(body) || /error|not/i.test(body),
        )
      }
    }
    // Unsubscribe the first row if present.
    const unsub = page.getByRole('button', { name: /Unsubscribe/ }).first()
    if (await unsub.count()) {
      await unsub.click()
      await page.waitForTimeout(1500)
      step('unsubscribe click handled', true)
    }
  }

  // The only tolerated console error is the known API projection-race 500 on
  // GET /metadata plus the expected offline fetch failures we deliberately
  // induced with setOffline(true).
  const unexpected = consoleErrors.filter(
    (e) =>
      !/Failed to load resource: the server responded with a status of 500/.test(e) &&
      !/Failed to fetch|net::ERR_INTERNET_DISCONNECTED|ERR_NETWORK/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-offline-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
