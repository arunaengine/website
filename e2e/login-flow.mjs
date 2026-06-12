import { chromium } from 'playwright-core'

const BASE = 'http://localhost:5173'
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

try {
  // 1. Landing shows a Sign in button (no dedicated /login page anymore)
  await page.goto(BASE + '/')
  await page.waitForSelector('header')
  await page.waitForTimeout(1000)
  const landingSignIn = page.locator('header').getByRole('button', { name: /^Sign in$/ })
  step('landing nav shows Sign in button', (await landingSignIn.count()) > 0)

  // 2. Guest dashboard
  await page.goto(BASE + '/app')
  await page.waitForSelector('h1, h2', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const guestBody = await page.textContent('body')
  step('guest dashboard shows guest copy', guestBody.includes('Aruna data portal') && guestBody.includes('guest'))

  // 3. Clicking Sign in in the top bar redirects straight to Keycloak (no interstitial)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/, { timeout: 15000 })
  step('Sign in redirects straight to Keycloak', page.url().includes('/realms/aruna/protocol/openid-connect/auth'))
  step('did not stop on an in-app /login page', !page.url().includes('/login'))

  // 4. Log in as alice
  await page.fill('#username', 'alice')
  await page.fill('#password', 'alice-password')
  await page.click('#kc-login')

  // 5. Callback completes and lands back in the app
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  step('callback completed, landed in app', true, page.url())
  await page.waitForTimeout(2000)
  const body = await page.textContent('body')
  step('topbar shows Alice OIDC', body.includes('Alice OIDC'))
  step('welcome message personalised', body.includes('Welcome back, Alice'))

  // 6. Settings shows the session
  await page.goto(BASE + '/app/settings')
  await page.waitForTimeout(1500)
  const settingsBody = await page.textContent('body')
  step('settings shows signed-in session', settingsBody.includes('Signed in as Alice OIDC'))

  // 7. Session survives a reload
  await page.reload()
  await page.waitForTimeout(2000)
  step('session survives reload', (await page.textContent('body')).includes('Signed in as Alice OIDC'))

  // 8. Sign out from the topbar menu
  await page.locator('button:has-text("Alice OIDC")').first().click()
  await page.getByText('Sign out', { exact: false }).last().click()
  await page.waitForURL((u) => u.toString().startsWith(BASE) && !u.toString().includes('/app'), { timeout: 20000 })
  await page.waitForTimeout(1500)
  step('signed out, back on landing', !(await page.textContent('body')).includes('Alice OIDC'), page.url())

  // 9. Keycloak SSO session really ended: a fresh Sign in asks for credentials again
  await page.goto(BASE + '/app')
  await page.waitForTimeout(1000)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/, { timeout: 15000 })
  step('keycloak SSO session ended (asks for credentials again)', (await page.locator('#username').count()) > 0)
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-login-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
