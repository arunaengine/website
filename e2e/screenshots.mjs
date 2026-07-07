import { chromium } from 'playwright-core'

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const out = process.env.SHOT_DIR || '/tmp/portal-shots'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(15000)

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false })
  console.log('shot', name)
}

// Guest views
await page.goto(BASE + '/')
await page.waitForTimeout(1200)
await shot('01-landing')
await page.goto(BASE + '/app')
await page.waitForTimeout(1500)
await shot('02-guest-dashboard')

// Sign in as admin (clicking Sign in redirects straight to Keycloak)
await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
await page.waitForURL(/localhost:8080/)
await page.fill('#username', 'aruna-admin')
await page.fill('#password', 'aruna-admin')
await page.click('#kc-login')
await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'))
await page.waitForTimeout(2000)
await shot('03-dashboard-signed-in')
await page.goto(BASE + '/app/settings')
await page.waitForTimeout(1500)
await shot('04-settings-session')

// Honest not-found view for an unknown app URL
await page.goto(BASE + '/app/nope')
await page.waitForTimeout(1000)
await shot('05-not-found')

// Discover catalog (loading skeleton / results)
await page.goto(BASE + '/app/search')
await page.waitForTimeout(1500)
await shot('06-discover')

await browser.close()
console.log('done')
