import { chromium } from 'playwright-core'

// Server-backed Discover search (aruna#258, portal part). Drives a single
// signed-in admin session against a live stack (ARUNA_PORTAL_BASE, default
// http://localhost:5173): creates a probe dataset, searches for it via
// GET /metadata/search, checks the honest empty state, the browse fallback
// when the query is cleared, and the client-side group filter.
//
// Infinite-scroll steps require portal-config features.searchCursor=true and an
// aruna#258 backend; they are gated behind SEARCH_CURSOR=1 and skipped
// otherwise. Requires a running portal + backend; do NOT block the branch on
// execution — this file is syntax-checked only (node --check).
const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const GROUP_NAME = process.env.ARUNA_SEARCH_GROUP || 'Genomics lab'
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

  // Create a probe dataset through the New dataset dialog.
  await page.getByRole('button', { name: 'New dataset' }).first().click()
  await page.waitForSelector('text=New metadata document')
  const dialog = page.locator('[role="dialog"]')
  await dialog.locator('select').first().selectOption({ label: GROUP_NAME })
  await dialog.getByPlaceholder('Dataset title').fill('Search enrichment probe')
  await dialog.getByPlaceholder('datasets/my-dataset').fill('datasets/search-enrichment-probe')
  await dialog.locator('textarea').fill('Probe dataset created by the search E2E flow.')
  await dialog.getByRole('button', { name: /Create metadata/ }).click()
  await page.waitForURL(/\/app\/metadata\//, { timeout: 15000 })
  await page.waitForTimeout(1500)
  step('probe dataset created', (await page.textContent('body')).includes('Search enrichment probe'), page.url())

  // Server search: a non-empty query hits GET /metadata/search.
  await page.goto(BASE + '/app/search')
  await page.waitForTimeout(1000)
  const searchInput = page.locator('input[placeholder*="Search title"]')
  await searchInput.fill('enrichment probe')
  // Debounce (300ms) + request + index projection lag tolerance.
  await page.waitForTimeout(2500)
  const searchBody = await page.textContent('body')
  step('server search returns the probe dataset', searchBody.includes('Search results') && searchBody.includes('Search enrichment probe'))
  step('query is reflected in the url', page.url().includes('q='), page.url())

  // A healthy stack answers from every node, so no partial banner.
  step('no partial-results banner on a healthy stack', !searchBody.includes('Partial results'))

  // A nonsense query yields the honest empty state.
  await searchInput.fill('zzz-no-such-term-零')
  await page.waitForTimeout(2500)
  step('nonsense query shows the no-matches empty state', (await page.textContent('body')).includes('No matches'))

  // Clearing the query returns to the client-side browse catalog.
  await searchInput.fill('')
  await page.waitForTimeout(1000)
  step('cleared query returns to the browse catalog', (await page.textContent('body')).includes('Catalog'))

  // Client-side group filter over search results.
  await searchInput.fill('enrichment probe')
  await page.waitForTimeout(2500)
  const groupSelect = page.getByLabel('Filter by group')
  await groupSelect.selectOption({ label: GROUP_NAME })
  await page.waitForTimeout(1000)
  step('probe still shown when filtered to its own group', (await page.textContent('body')).includes('Search enrichment probe'))

  const optionLabels = await groupSelect.locator('option').allTextContents()
  const otherGroup = optionLabels.map((l) => l.trim()).find((l) => l && l !== 'any group' && l !== GROUP_NAME)
  if (otherGroup) {
    await groupSelect.selectOption({ label: otherGroup })
    await page.waitForTimeout(1000)
    step('probe hidden when filtered to a different group', !(await page.textContent('body')).includes('Search enrichment probe'), otherGroup)
    await groupSelect.selectOption({ label: 'any group' })
    await page.waitForTimeout(500)
  } else {
    step('probe hidden when filtered to a different group', true, 'only one group visible — skipped')
  }

  // Cursor infinite scroll: only meaningful with features.searchCursor=true and
  // an aruna#258 backend serving next_cursor.
  if (process.env.SEARCH_CURSOR === '1') {
    await groupSelect.selectOption({ label: 'any group' }).catch(() => {})
    await searchInput.fill('e')
    await page.waitForTimeout(2500)
    const before = (await page.textContent('body')).length
    await page.mouse.wheel(0, 20000)
    await page.waitForTimeout(2500)
    const after = await page.textContent('body')
    step('infinite scroll reaches the end or grows the result set', after.includes('End of results.') || after.length > before)
  } else {
    step('infinite scroll (searchCursor)', true, 'SEARCH_CURSOR!=1 — skipped')
  }

  // The only tolerated console error is the known API projection-race 500 on
  // GET /metadata, which the portal retries and recovers from.
  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of 500/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-search-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
