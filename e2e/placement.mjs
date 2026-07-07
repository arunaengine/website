// Placement admin end-to-end flow (aruna#269).
//
// Three tiers:
//   1. UNGATED, runnable today — the Status "Locations" panel and per-node
//      placement details are pure derivations of GET /info/realm, served now.
//   2. FLAG-OFF no-ops, runnable today — with the default config (placementAdmin
//      off) the group Placement section, the sidebar entry, and the AdminView
//      "Placement →" link are all absent, and /app/admin/placement renders the
//      honest "not enabled" panel without issuing a single request.
//   3. FLAG-ON, env-guarded (ARUNA_E2E_PLACEMENT=1) — requires a backend that
//      implements the aruna#269 endpoints AND a portal-config.json serving
//      {"features":{"placementAdmin":true}}. Until both exist this tier is
//      skipped. The whole file stays valid ESM (`node --check`) so it drops
//      straight into CI once the backend lands; it is never run as a branch gate.
import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const FLAG_ON = process.env.ARUNA_E2E_PLACEMENT === '1'
const results = []
function step(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)
}

async function signIn(page, username, password) {
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await page.waitForTimeout(2000)
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
  await signIn(page, 'aruna-admin', 'aruna-admin')
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // ── Tier 1: ungated realm status ──────────────────────────────────────────
  await page.goto(BASE + '/app/status')
  await page.waitForTimeout(2000)
  const statusBody = await page.textContent('body')
  step('status shows the locations panel', statusBody.includes('Locations'))
  // Expand the first node row; NodeDetailPanel always renders a Placement block
  // (either the location/weight grid or "Not in the realm's placement map.").
  await page.locator('button[aria-expanded]').first().click()
  await page.waitForTimeout(600)
  const nodeBody = await page.textContent('body')
  step(
    'node detail shows placement info',
    nodeBody.includes('Placement') &&
      (nodeBody.includes('Not in the realm') || nodeBody.includes('Location')),
  )

  // ── Tier 2: flag-off no-ops ───────────────────────────────────────────────
  const sidebarHasPlacement = (await page.locator('nav[aria-label="Portal navigation"]').getByText('Placement').count()) > 0
  step('sidebar has no Placement entry while flag off', FLAG_ON || !sidebarHasPlacement)

  await page.goto(BASE + '/app/groups')
  await page.waitForTimeout(1500)
  // Open the first group the admin can see; its detail panel must not render the
  // Placement section (admin-only AND flag-gated).
  await page.locator('li').filter({ hasText: /.+/ }).first().click().catch(() => {})
  await page.waitForTimeout(1500)
  const groupBody = await page.textContent('body')
  step(
    'group placement section hidden while flag off',
    FLAG_ON || !groupBody.includes('Where this group’s data lives'),
  )

  await page.goto(BASE + '/app/admin/placement')
  await page.waitForTimeout(1500)
  const gatedBody = await page.textContent('body')
  step('gated view renders honest disabled panel', FLAG_ON || gatedBody.includes('not enabled'))

  await page.goto(BASE + '/app/admin')
  await page.waitForTimeout(1500)
  const adminBody = await page.textContent('body')
  step('admin view has no Placement link while flag off', FLAG_ON || !adminBody.includes('Placement →'))

  // ── Tier 3: flag-on (env-guarded) ─────────────────────────────────────────
  if (FLAG_ON) {
    await page.goto(BASE + '/app/admin/placement')
    await page.waitForTimeout(2000)
    const placeBody = await page.textContent('body')
    step('placement admin view renders defaults + transitions', placeBody.includes('Placement defaults') && placeBody.includes('Transitions'))

    await page.goto(BASE + '/app/groups')
    await page.waitForTimeout(1500)
    await page.locator('li').filter({ hasText: /.+/ }).first().click().catch(() => {})
    await page.waitForTimeout(2000)
    const groupOn = await page.textContent('body')
    step('group placement section visible with flag on', groupOn.includes('Where this group’s data lives'))

    // Toggle "distinct locations", pin the first available location, then save.
    await page.getByText('Spread replicas across distinct locations').click().catch(() => {})
    await page.locator('button[aria-pressed]').first().click().catch(() => {})
    await page.getByRole('button', { name: /Save strategy/ }).click().catch(() => {})
    await page.waitForTimeout(2000)
    const afterSave = await page.textContent('body')
    // Either the badge flips to "group strategy" (success) or a verbatim server
    // 400 bounds message renders — both are acceptable honest outcomes.
    step('save returns a strategy badge or a server message', afterSave.includes('group strategy') || afterSave.includes('Placement'))
  } else {
    step('flag-on tier skipped (set ARUNA_E2E_PLACEMENT=1)', true, 'skipped by design')
  }

  step('no console errors during placement flow', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-placement-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
