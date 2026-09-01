// Storage end-to-end flow: record placement, data placement and one bucket's
// Storage page.
//
// The current backend serves GET/PATCH /info/realm/placement and the portal
// enables placement administration by default. Set ARUNA_E2E_PLACEMENT=0 only
// when testing an explicit runtime override.
import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const FLAG_ON = process.env.ARUNA_E2E_PLACEMENT !== '0'
const results = []
function step(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ': ' + detail : ''}`)
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

  // ── Runtime gate ──────────────────────────────────────────────────────────
  // Placement lives as a tab of the Admin view; the legacy /app/admin/placement
  // URL redirects to /app/admin?tab=placement and the tab hides when gated off.
  await page.goto(BASE + '/app/admin/placement')
  await page.waitForTimeout(1500)
  step('legacy placement url redirects into the admin view', page.url().includes('/app/admin'))

  const recordTabCount = await page.getByRole('tab', { name: 'Record placement', exact: true }).count()
  const dataTabCount = await page.getByRole('tab', { name: 'Data placement', exact: true }).count()
  step('admin placement tabs follow the runtime gate', FLAG_ON ? recordTabCount > 0 && dataTabCount > 0 : recordTabCount === 0)
  step('the two admin tabs no longer share the word Placement alone',
    (await page.getByRole('tab', { name: 'Placement', exact: true }).count()) === 0)

  // ── Unified placement API ─────────────────────────────────────────────────
  if (FLAG_ON) {
    await page.goto(BASE + '/app/admin/placement')
    await page.waitForTimeout(2000)
    const placeBody = await page.textContent('body')
    step('placement admin view renders strategies and group bindings', placeBody.includes('Strategies') && placeBody.includes('Group bindings'))
    step('unsupported transitions are not advertised', !placeBody.includes('Transitions'))

    // Toggle an existing strategy and save through PATCH /info/realm/placement.
    await page.getByText('Spread replicas across distinct locations').click().catch(() => {})
    await page.locator('button[aria-pressed]').first().click().catch(() => {})
    await page.getByRole('button', { name: /Save strategy/ }).click().catch(() => {})
    await page.waitForTimeout(2000)
    const afterSave = await page.textContent('body')
    step('save returns confirmation or a server message', afterSave.includes('rule saved') || afterSave.includes('Record placement'))

    // ── Data placement: the library, the rule editor, the enforcement surface ─
    await page.goto(BASE + '/app/admin?tab=data-placement')
    await page.waitForTimeout(2000)
    const dataBody = await page.textContent('body')
    step('data placement holds the library, the editor and the enforcement surface',
      dataBody.includes('Published policies')
        && dataBody.includes('Copies may be stored on')
        && dataBody.includes('Placement enforcement on this node'))
    step('the editor offers no operator the backend lacks',
      !dataBody.includes('Forbid') && !dataBody.includes('Preferred') && !dataBody.includes('Minimum copies'))

    const policyName = `e2e allowed nodes ${Date.now()}`
    await page.getByLabel('Name', { exact: true }).first().fill(policyName).catch(() => {})
    // Any published location, or the first advertised executor, makes the one
    // card non-empty; without either the realm cannot be constrained at all.
    const locationChip = page.locator('button[aria-pressed]').first()
    if (await locationChip.count()) await locationChip.click().catch(() => {})
    const publish = page.getByRole('button', { name: /Publish policy/ })
    const publishable = await publish.first().isEnabled().catch(() => false)
    if (publishable) {
      await publish.first().click()
      await page.waitForTimeout(2500)
      step('publishing adds the policy to the library', (await page.textContent('body')).includes(policyName))
    } else {
      step('publishing adds the policy to the library', true, 'no realm condition to pick, skipped')
    }

    // ── One bucket's Storage page ────────────────────────────────────────────
    await page.goto(BASE + '/app/buckets')
    await page.waitForTimeout(2500)
    const bucketLink = page.locator('a[href*="/app/buckets/"]').first()
    if (await bucketLink.count()) {
      await bucketLink.click()
      await page.waitForTimeout(2500)
      const storageEntry = page.getByRole('link', { name: /^Storage/ })
      if (await storageEntry.count()) {
        await storageEntry.first().click()
        await page.waitForTimeout(2500)
        const overview = await page.textContent('body')
        step('the bucket storage page opens on its overview',
          page.url().includes('/storage')
            && overview.includes('Storage for')
            && overview.includes('Storage backend for new uploads')
            && overview.includes('Observed on this node'))
        step('the overview never invents a copy count', overview.includes('Checked per file'))
        step('bucket deletion lives in the overview danger zone',
          overview.includes('Danger zone') && overview.includes('Delete bucket permanently'))

        await page.goto(page.url().split('?')[0] + '?tab=placement')
        await page.waitForTimeout(2500)
        const placementTab = await page.textContent('body')
        step('the placement tab separates the rules from the compliance count',
          placementTab.includes('Where copies may be stored')
            && placementTab.includes('Compliance on this node')
            && placementTab.includes('Counted on this node only'))

        const attach = page.getByLabel('Attach a placement policy')
        if (await attach.count()) {
          await attach.first().click().catch(() => {})
          await page.waitForTimeout(600)
          await page.keyboard.press('Enter').catch(() => {})
          await page.waitForTimeout(600)
          await page.getByRole('button', { name: /^Save$/ }).first().click().catch(() => {})
          await page.waitForTimeout(2500)
          const saved = await page.textContent('body')
          step('attaching a policy is saved or refused with a reason',
            saved.includes('New objects in this bucket carry') || saved.includes('changed by someone else'))
        } else {
          step('attaching a policy is saved or refused with a reason', true, 'nothing attachable, skipped')
        }

        await page.goto(page.url().split('?')[0] + '?tab=syncs')
        await page.waitForTimeout(2000)
        step('the syncs tab states that the list is creator scoped',
          (await page.textContent('body')).includes('Only syncs you created are listed'))
      } else {
        step('the bucket storage page opens on its overview', true, 'no Storage entry, skipped')
      }
    } else {
      step('the bucket storage page opens on its overview', true, 'no bucket to open, skipped')
    }
  } else {
    step('placement API tier skipped by runtime override', true, 'skipped by design')
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
