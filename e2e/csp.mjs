// Serves the built portal under the policy an Aruna node sends (aruna api/src/csp.rs)
// and fails on any violation. Run after `npm run build`; needs no backend.
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'frame-src blob:',
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: https://registry.npmjs.org https://pypi.org http://localhost:* http://127.0.0.1:*",
  // The node also lists http://[::1]:*, which browsers reject as an invalid source and ignore.
].join('; ')

const ROUTES = ['/', '/app', '/app/datasets', '/app/buckets', '/app/status', '/app/docs/v1', '/app/docs/v1/api', '/app/profiles']

// No project config: its dev proxy would forward the API calls to a node that is not there.
const server = await preview({
  configFile: false,
  preview: { host: '127.0.0.1', port: 0, headers: { 'Content-Security-Policy': POLICY } },
})
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
const violations = []

try {
  const page = await browser.newPage()
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(`${page.url()}: ${message.text()}`)
  })
  // Injected by the browser, so the listener itself is not subject to the policy.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`Content Security Policy: ${event.effectiveDirective} blocked ${event.blockedURI || 'inline'} at ${event.sourceFile}:${event.lineNumber}`)
    })
  })
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: 'load' })
    await page.waitForFunction(() => !document.querySelector('#app > main[aria-busy="true"]'), null, { timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    console.log(`checked ${route}`)
  }
} finally {
  await browser.close()
  await server.close()
}

for (const violation of new Set(violations)) console.log(`FAIL: ${violation}`)
if (violations.length) process.exit(1)
console.log(`PASS: ${ROUTES.length} routes render without a policy violation`)
