// Join requests end-to-end flow (aruna#248).
//
// Requires a backend that implements the aruna#248 join-request endpoints AND a
// portal-config.json serving {"features":{"joinRequests":true}}. Until both
// exist this script is skipped/failing BY DESIGN — it is kept syntactically
// valid ESM (`node --check`) so it drops straight into CI once the backend
// lands. It drives two browser contexts: A = aruna-admin (group admin),
// B = alice (a requester) against Keycloak on localhost:8080.
import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const GROUP_NAME = process.env.ARUNA_JOIN_GROUP || 'Genomics lab'
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

const ctxA = await browser.newContext()
const ctxB = await browser.newContext()
const admin = await ctxA.newPage()
const alice = await ctxB.newPage()
admin.setDefaultTimeout(15000)
alice.setDefaultTimeout(15000)

try {
  await signIn(admin, 'aruna-admin', 'aruna-admin')
  step('admin signed in', (await admin.textContent('body')).includes('Aruna Admin'))

  // B requests to join the admin's group from the "Other groups" list.
  await signIn(alice, 'alice', 'alice-password')
  await alice.goto(BASE + '/app/groups')
  await alice.waitForTimeout(1500)
  const otherRow = alice.locator('li', { hasText: GROUP_NAME })
  await otherRow.getByRole('button', { name: /Request to join/ }).first().click()
  await alice.waitForSelector('text=Request to join')
  await alice.locator('[role="dialog"] textarea').fill('Please add me to the lab.')
  await alice.locator('[role="dialog"]').getByRole('button', { name: /Send request/ }).click()
  await alice.waitForTimeout(1500)
  step('join request created', (await alice.textContent('body')).includes('requested'))

  // Withdraw then re-request, exercising the DELETE path and button revert.
  await alice.getByRole('button', { name: /Withdraw/ }).first().click()
  await alice.waitForTimeout(1200)
  step('withdraw works', (await alice.textContent('body')).includes('Request to join'))
  await otherRow.getByRole('button', { name: /Request to join/ }).first().click()
  await alice.waitForSelector('text=Request to join')
  await alice.locator('[role="dialog"] textarea').fill('Re-requesting to join the lab.')
  await alice.locator('[role="dialog"]').getByRole('button', { name: /Send request/ }).click()
  await alice.waitForTimeout(1500)
  step('re-request created', (await alice.textContent('body')).includes('requested'))

  // A opens the group and approves with the default `user` role chip selected.
  await admin.goto(BASE + '/app/groups')
  await admin.waitForTimeout(1500)
  await admin.locator('li', { hasText: GROUP_NAME }).first().click()
  await admin.waitForTimeout(1500)
  const inboxBody = await admin.textContent('body')
  step('admin sees the request with message', inboxBody.includes('Re-requesting to join the lab.'))
  await admin.getByRole('button', { name: /^Approve$/ }).first().click()
  await admin.waitForTimeout(500)
  await admin.getByRole('button', { name: /Approve & assign roles/ }).click()
  await admin.waitForTimeout(2000)
  step('approval assigns membership', (await admin.textContent('body')).includes('alice'))

  // B reloads: the group moved into "Your groups" and the row reads "approved".
  await alice.goto(BASE + '/app/groups')
  await alice.waitForTimeout(1500)
  step('requester sees the decision', (await alice.textContent('body')).includes('approved'))

  // Deny path: alice leaves, re-requests, admin denies with a reason.
  await alice.locator('li', { hasText: GROUP_NAME }).first().click()
  await alice.waitForTimeout(1000)
  await alice.getByRole('button', { name: /Leave group/ }).first().click()
  await alice.waitForTimeout(1500)
  await alice.goto(BASE + '/app/groups')
  await alice.waitForTimeout(1500)
  const otherRow2 = alice.locator('li', { hasText: GROUP_NAME })
  await otherRow2.getByRole('button', { name: /Request to join/ }).first().click()
  await alice.waitForSelector('text=Request to join')
  await alice.locator('[role="dialog"]').getByRole('button', { name: /Send request/ }).click()
  await alice.waitForTimeout(1500)

  await admin.goto(BASE + '/app/groups')
  await admin.waitForTimeout(1500)
  await admin.locator('li', { hasText: GROUP_NAME }).first().click()
  await admin.waitForTimeout(1500)
  await admin.getByRole('button', { name: /^Deny$/ }).first().click()
  await admin.waitForTimeout(500)
  await admin.locator('[role="dialog"], .bg-muted\\/20').getByPlaceholder(/Why is this request declined/).fill('Not this quarter.')
  await admin.getByRole('button', { name: /Deny request/ }).click()
  await admin.waitForTimeout(2000)

  await alice.goto(BASE + '/app/groups')
  await alice.waitForTimeout(1500)
  const deniedBody = await alice.textContent('body')
  step('requester sees the denial and reason', deniedBody.includes('denied') && deniedBody.includes('Not this quarter.'))
} catch (err) {
  step('E2E run', false, String(err))
  await admin.screenshot({ path: '/tmp/e2e-join-requests-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
