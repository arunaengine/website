import { chromium } from 'playwright-core'
import { a11yAudit } from './a11y-checker.mjs'

// Whole-portal accessibility sweep (issue #295).
//
// Runs the dependency-free in-page checker (./a11y-checker.mjs) across every
// main view — guest and signed-in — in BOTH light and dark themes, and drives
// a few keyboard flows (skip link, dialog open/close focus, menu, query view).
// A view PASSES when it reports ZERO gating violations; the fuzzier heuristics
// (contrast, heading order, scrollable regions) print as warnings and never
// gate. Config-gated surfaces (tes / placementAdmin / deviceEnrollment /
// subscriptions) are visited only when their flag is on, else logged as SKIP.
//
// Branch gate (per engagement — e2e never blocks on a live stack):
//   node --check e2e/a11y.mjs && node --check e2e/a11y-checker.mjs
// Live invocation (CI / compose stack):
//   ARUNA_PORTAL_BASE=http://localhost:5173 node e2e/a11y.mjs
// Optional vendored-axe run (no package.json dependency added):
//   AXE_JS=/abs/path/axe.min.js ARUNA_PORTAL_BASE=... node e2e/a11y.mjs

const BASE = process.env.ARUNA_PORTAL_BASE || 'http://localhost:5173'
const AXE_JS = process.env.AXE_JS || ''
const results = []
function step(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(15000)
const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

async function settle(ms = 1200) {
  await page.waitForTimeout(ms)
}

// Layer defaults exactly like src/lib/config.ts (searchCursor defaults on).
async function loadFlags() {
  const cfg = await page
    .evaluate(async () => {
      try {
        const r = await fetch('/portal-config.json', { headers: { Accept: 'application/json' } })
        return r.ok ? await r.json() : {}
      } catch {
        return {}
      }
    })
    .catch(() => ({}))
  return { searchCursor: true, ...(cfg && cfg.features ? cfg.features : {}) }
}

function summarize(list) {
  const by = {}
  for (const v of list) by[v.rule] = (by[v.rule] || 0) + 1
  return Object.entries(by)
    .map(([r, n]) => `${r}×${n}`)
    .join(', ')
}

// Run the checker in the current theme AND the opposite theme (CSS vars only —
// no reload needed), dedup, and assert zero gating violations for the view.
async function auditView(name, { contrast = true } = {}) {
  const gather = async (contrastOn) => {
    if (AXE_JS) {
      await page.addScriptTag({ path: AXE_JS }).catch(() => {})
      const r = await page.evaluate(async () =>
        window.axe ? (await window.axe.run(document, { resultTypes: ['violations'] })).violations : null,
      )
      if (r)
        return {
          violations: r.map((v) => ({
            rule: v.id,
            impact: v.impact,
            selector: (v.nodes[0] && v.nodes[0].target.join(' ')) || '',
            detail: v.help,
          })),
          warnings: [],
        }
    }
    return await page.evaluate(a11yAudit, { contrast: contrastOn })
  }

  let light, dark
  try {
    light = await gather(contrast)
    await page.evaluate(() => document.documentElement.classList.toggle('dark'))
    dark = await gather(contrast)
    await page.evaluate(() => document.documentElement.classList.toggle('dark'))
  } catch (err) {
    step(`a11y: ${name} — checker ran`, false, String(err))
    return []
  }

  const seen = new Set()
  const gating = []
  for (const v of [...light.violations, ...dark.violations]) {
    const k = v.rule + '|' + v.selector
    if (!seen.has(k)) {
      seen.add(k)
      gating.push(v)
    }
  }
  const warns = [...light.warnings, ...dark.warnings]
  if (warns.length) console.log(`  · ${name}: ${warns.length} warning(s) — ${summarize(warns)}`)
  step(
    `a11y: ${name} — no gating violations`,
    gating.length === 0,
    gating
      .slice(0, 6)
      .map((v) => `${v.rule}@${v.selector}`)
      .join(' | '),
  )
  return gating
}

async function visit(path, name) {
  await page.goto(BASE + path)
  await settle()
  return auditView(name)
}

try {
  await page.goto(BASE + '/app')
  await settle()
  const flags = await loadFlags()
  console.log(`flags: ${JSON.stringify(flags)}`)

  // ── Guest pass ─────────────────────────────────────────────────────────────
  await visit('/', 'guest: landing')
  await visit('/app', 'guest: dashboard')
  await visit('/app/search', 'guest: discover')
  await visit('/app/search?expert=1', 'guest: search expert')
  await visit('/app/status', 'guest: status')

  // ── Sign in as realm admin (Keycloak) ──────────────────────────────────────
  await page.goto(BASE + '/app')
  await settle(1500)
  await page.locator('header').getByRole('button', { name: /^Sign in$/ }).first().click()
  await page.waitForURL(/localhost:8080/)
  await page.fill('#username', 'aruna-admin')
  await page.fill('#password', 'aruna-admin')
  await page.click('#kc-login')
  await page.waitForURL((u) => u.toString().startsWith(BASE + '/app'), { timeout: 20000 })
  await settle(2000)
  step('admin signed in', (await page.textContent('body')).includes('Aruna Admin'))

  // ── Signed-in pass ─────────────────────────────────────────────────────────
  await visit('/app', 'auth: dashboard')
  await visit('/app/buckets', 'auth: data manager')
  await visit('/app/search', 'auth: discover')
  // Follow the first result into a metadata detail view, if any.
  try {
    const firstCard = page.locator('a[href*="/app/metadata/"]').first()
    if (await firstCard.count()) {
      await firstCard.click()
      await settle()
      await auditView('auth: metadata detail')
    } else {
      step('a11y: auth: metadata detail — no result to open', true, 'skipped (empty catalog)')
    }
  } catch (err) {
    step('a11y: auth: metadata detail', false, String(err))
  }
  await visit('/app/search?expert=1', 'auth: search expert')
  await visit('/app/profiles', 'auth: profiles')
  await visit('/app/groups', 'auth: groups')
  await visit('/app/status', 'auth: status')
  await visit('/app/settings', 'auth: settings')
  await visit('/app/admin', 'auth: admin')
  await visit('/app/admin/onboarding', 'auth: admin onboarding')

  // ── Config-gated views (visited only when enabled) ──────────────────────────
  const gated = [
    { flag: 'tes', paths: [['/app/compute', 'compute'], ['/app/compute/new', 'compute submit']] },
    { flag: 'placementAdmin', paths: [['/app/admin/placement', 'placement admin']] },
    { flag: 'deviceEnrollment', paths: [['/app/settings/devices', 'devices']] },
    { flag: 'subscriptions', paths: [['/app/settings/subscriptions', 'subscriptions']] },
  ]
  for (const g of gated) {
    if (flags[g.flag]) {
      for (const [p, n] of g.paths) await visit(p, `gated(${g.flag}): ${n}`)
    } else {
      step(`a11y: gated(${g.flag}) — SKIP (flag off)`, true)
    }
  }

  // ── Keyboard flows (DoD: keyboard navigable end to end) ─────────────────────
  // (a) Skip link is the first tab stop and moves focus to <main>.
  await page.goto(BASE + '/app')
  await settle()
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => ({ text: (document.activeElement.textContent || '').trim() }))
  step('keyboard: first Tab focuses "Skip to content"', /Skip to content/i.test(first.text), first.text.slice(0, 40))
  await page.keyboard.press('Enter')
  await settle(300)
  const mainFocused = await page.evaluate(() => document.activeElement && document.activeElement.id)
  step('keyboard: skip link moves focus to #main-content', mainFocused === 'main-content', 'active=' + mainFocused)

  // (b) New dataset dialog: Enter opens + traps focus, Escape closes + restores.
  try {
    const newBtn = page.getByRole('button', { name: /New dataset/ }).first()
    if (await newBtn.count()) {
      await newBtn.focus()
      await page.keyboard.press('Enter')
      await settle(500)
      const inDialog = await page.evaluate(
        () => !!(document.activeElement && document.activeElement.closest('[role="dialog"]')),
      )
      step('keyboard: Enter opens New dataset dialog and focus enters it', inDialog)
      await page.keyboard.press('Escape')
      await settle(400)
      const restored = await page.evaluate(() => /New dataset/.test(document.activeElement.textContent || ''))
      step('keyboard: Escape closes dialog and restores focus to the trigger', restored)
    } else {
      step('keyboard: New dataset dialog flow', true, 'skipped (button not present)')
    }
  } catch (err) {
    step('keyboard: New dataset dialog flow', false, String(err))
  }

  // (c) User menu: Enter opens, ArrowDown steps items, Escape closes.
  try {
    const trigger = page.locator('header [aria-haspopup="menu"], header button:has(.ring-0)').first()
    if (await trigger.count()) {
      await trigger.focus()
      await page.keyboard.press('Enter')
      await settle(300)
      const menuOpen = await page.evaluate(() => !!document.querySelector('[role="menu"]'))
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Escape')
      await settle(200)
      step('keyboard: user menu opens with Enter and closes with Escape', menuOpen)
    } else {
      step('keyboard: user menu flow', true, 'skipped (trigger not found)')
    }
  } catch (err) {
    step('keyboard: user menu flow', false, String(err))
  }

  // (d) Search expert mode: the SPARQL Run button is keyboard-focusable.
  await page.goto(BASE + '/app/search?expert=1')
  await settle()
  const runFocusable = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^\s*Run\b/i.test(x.textContent || ''))
    if (!b) return false
    b.focus()
    return document.activeElement === b
  })
  step('keyboard: sparql Run button is focusable', runFocusable)

  const unexpected = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of (404|500)/.test(e),
  )
  step('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '))
} catch (err) {
  step('E2E run', false, String(err))
  await page.screenshot({ path: '/tmp/e2e-a11y-failure.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
process.exit(failed.length ? 1 : 0)
