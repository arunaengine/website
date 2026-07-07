// Dependency-free, in-page accessibility checker (issue #295).
//
// This is a hand-rolled, axe-inspired sweep — NOT a replacement for axe-core.
// The engagement forbids adding an npm dependency, so instead of vendoring
// axe (MPL-2.0) we implement the small set of DoD-relevant rules ourselves.
// It is deliberately conservative: gating rules err toward NO false positives
// (they only fire on unambiguous problems), and the fuzzier heuristics
// (contrast, heading order, scrollable regions) are WARN-only and never gate.
//
// Two ways to run it in a page:
//   1. Preferred (used by a11y.mjs):  await page.evaluate(a11yAudit, opts)
//      — playwright serializes the function; it is fully self-contained
//      (references nothing at module scope) so this is safe.
//   2. String form:  page.evaluate(new Function('opts', checkerSource + '\n return a11yAudit(opts)'), opts)
//
// Vendored-axe alternative (opt-in, no dependency added to package.json):
// an operator can supply a local axe build and a11y.mjs will prefer it via
//   AXE_JS=/path/to/axe.min.js  → page.addScriptTag({ path: process.env.AXE_JS })
// See a11y.mjs for that hook.
//
// Returns: { violations: Rule[], warnings: Rule[] } where
//   Rule = { rule, impact, selector, detail }

export function a11yAudit(opts) {
  const options = opts || {}
  const violations = []
  const warnings = []
  const push = (bucket, rule, impact, el, detail) =>
    bucket.push({ rule, impact, selector: sel(el), detail: detail || '' })

  // ── helpers ────────────────────────────────────────────────────────────────
  function sel(el) {
    if (!el || el.nodeType !== 1) return String(el)
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id
    let s = el.tagName.toLowerCase()
    if (typeof el.className === 'string' && el.className.trim()) {
      const c = el.className.trim().split(/\s+/).slice(0, 2).join('.')
      if (c) s += '.' + c
    }
    const p = el.parentElement
    if (p) {
      const same = Array.prototype.filter.call(p.children, (x) => x.tagName === el.tagName)
      if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(el) + 1) + ')'
    }
    return s
  }

  function rendered(el) {
    const st = getComputedStyle(el)
    if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  }

  function inAriaHidden(el) {
    return !!el.closest('[aria-hidden="true"]')
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function fromLabelledby(el) {
    const ids = el.getAttribute('aria-labelledby')
    if (!ids) return ''
    return ids
      .split(/\s+/)
      .map((id) => {
        const t = document.getElementById(id)
        return t ? textOf(t) : ''
      })
      .join(' ')
      .trim()
  }

  // Accessible name for buttons/links/generic controls.
  function accName(el) {
    const lb = fromLabelledby(el)
    if (lb) return lb
    const al = el.getAttribute('aria-label')
    if (al && al.trim()) return al.trim()
    const txt = textOf(el)
    if (txt) return txt
    const img = el.querySelector('img[alt]')
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim()
    const labelled = el.querySelector('[aria-label]')
    if (labelled && labelled.getAttribute('aria-label').trim()) return labelled.getAttribute('aria-label').trim()
    const title = el.getAttribute('title')
    if (title && title.trim()) return title.trim()
    return ''
  }

  // Accessible name for form fields (adds native <label> association).
  function fieldName(el) {
    const lb = fromLabelledby(el)
    if (lb) return lb
    const al = el.getAttribute('aria-label')
    if (al && al.trim()) return al.trim()
    if (el.id) {
      try {
        const lbl = document.querySelector('label[for="' + (window.CSS ? CSS.escape(el.id) : el.id) + '"]')
        if (lbl && textOf(lbl)) return textOf(lbl)
      } catch {
        /* invalid id for selector — ignore */
      }
    }
    const wrap = el.closest('label')
    if (wrap && textOf(wrap)) return textOf(wrap)
    const title = el.getAttribute('title')
    if (title && title.trim()) return title.trim()
    return ''
  }

  function tabbable(el) {
    if (!rendered(el)) return false
    const ti = el.getAttribute('tabindex')
    if (ti !== null) return parseInt(ti, 10) >= 0
    const tag = el.tagName.toLowerCase()
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href')
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return !el.disabled
    if (el.isContentEditable) return true
    return false
  }

  const all = Array.prototype.slice.call(document.querySelectorAll('*'))

  // ── GATING: button-name ──────────────────────────────────────────────────
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!rendered(el) || inAriaHidden(el)) continue
    if (!accName(el)) push(violations, 'button-name', 'critical', el, 'button has no accessible name')
  }

  // ── GATING: link-name ────────────────────────────────────────────────────
  for (const el of document.querySelectorAll('a[href], [role="link"]')) {
    if (!rendered(el) || inAriaHidden(el)) continue
    if (!accName(el)) push(violations, 'link-name', 'serious', el, 'link has no accessible name')
  }

  // ── GATING: image-alt ────────────────────────────────────────────────────
  for (const img of document.querySelectorAll('img')) {
    if (!rendered(img) || inAriaHidden(img)) continue
    if (!img.hasAttribute('alt') && !img.getAttribute('aria-label') && !img.getAttribute('aria-labelledby'))
      push(violations, 'image-alt', 'critical', img, 'img has no alt attribute')
  }
  // Inline SVG that is NOT decorative, NOT inside a named control, and unnamed.
  for (const svg of document.querySelectorAll('svg')) {
    if (!rendered(svg) || inAriaHidden(svg)) continue
    if (svg.getAttribute('role') === 'img' && (svg.getAttribute('aria-label') || svg.querySelector('title'))) continue
    const host = svg.closest('button, a[href], [role="button"], [role="link"], label')
    if (host && accName(host)) continue // icon inside a labelled control — fine
    if (host) continue // inside a control that we already flag separately if unnamed
    // standalone svg carrying meaning without a name
    if (!svg.getAttribute('aria-label') && !svg.querySelector('title'))
      push(warnings, 'image-alt', 'moderate', svg, 'standalone svg without aria-hidden or a name')
  }

  // ── GATING: form-field-name (+ select-name) ──────────────────────────────
  const fieldSel =
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),' +
    ' select, textarea, [role="switch"], [role="combobox"], [role="checkbox"], [role="radio"], [role="textbox"], [role="spinbutton"]'
  for (const el of document.querySelectorAll(fieldSel)) {
    if (!rendered(el) || inAriaHidden(el)) continue
    const name = fieldName(el)
    if (name) continue
    const ph = el.getAttribute('placeholder')
    if (ph && ph.trim()) {
      push(warnings, 'form-field-name', 'moderate', el, 'named only by placeholder')
    } else {
      const rule = el.tagName.toLowerCase() === 'select' ? 'select-name' : 'form-field-name'
      push(violations, rule, 'critical', el, 'form field has no accessible name')
    }
  }

  // ── GATING: dialog-name ──────────────────────────────────────────────────
  for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (!rendered(el)) continue
    if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
      push(violations, 'dialog-name', 'serious', el, 'dialog has no accessible name (aria-label/-labelledby)')
  }

  // ── GATING: aria-hidden-focus ────────────────────────────────────────────
  for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
    const focusables = []
    if (tabbable(hidden)) focusables.push(hidden)
    for (const d of hidden.querySelectorAll('*')) if (tabbable(d)) focusables.push(d)
    if (focusables.length)
      push(violations, 'aria-hidden-focus', 'serious', hidden, focusables.length + ' tabbable node(s) inside aria-hidden')
  }

  // ── GATING: nested-interactive ───────────────────────────────────────────
  const containerSel =
    'button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"]'
  for (const container of document.querySelectorAll(containerSel)) {
    if (!rendered(container) || inAriaHidden(container)) continue
    for (const d of container.querySelectorAll('*')) {
      if (d === container) continue
      if (tabbable(d)) {
        push(violations, 'nested-interactive', 'serious', container, 'tabbable ' + sel(d) + ' nested in an interactive element')
        break
      }
    }
  }

  // ── WARN: page-has-h1 + heading-order ────────────────────────────────────
  const headings = all.filter((el) => /^H[1-6]$/.test(el.tagName) && rendered(el) && !inAriaHidden(el))
  if (!headings.some((h) => h.tagName === 'H1')) push(warnings, 'page-has-h1', 'moderate', document.body, 'no <h1> on the page')
  let prev = 0
  for (const h of headings) {
    const lvl = parseInt(h.tagName[1], 10)
    if (prev && lvl > prev + 1) push(warnings, 'heading-order', 'minor', h, 'heading level jumps from h' + prev + ' to h' + lvl)
    prev = lvl
  }

  // ── WARN: scrollable-region-focusable ────────────────────────────────────
  for (const el of all) {
    if (!rendered(el)) continue
    const st = getComputedStyle(el)
    const scrollableY = /(auto|scroll)/.test(st.overflowY) && el.scrollHeight - el.clientHeight > 4
    const scrollableX = /(auto|scroll)/.test(st.overflowX) && el.scrollWidth - el.clientWidth > 4
    if (!scrollableY && !scrollableX) continue
    if (tabbable(el)) continue
    // ok if it contains its own focusable content that a keyboard user can reach
    let hasFocusableChild = false
    for (const d of el.querySelectorAll('*')) {
      if (tabbable(d)) {
        hasFocusableChild = true
        break
      }
    }
    if (!hasFocusableChild) push(warnings, 'scrollable-region-focusable', 'moderate', el, 'scrollable region is not keyboard focusable')
  }

  // ── WARN: color-contrast (simplified WCAG luminance, alpha-composited) ─────
  if (options.contrast !== false) {
    const parseRGB = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s)
      if (!m) return null
      const p = m[1].split(',').map((x) => parseFloat(x))
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const lin = (c) => {
      c /= 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
    const effBg = (el) => {
      let cur = el
      let acc = null
      while (cur && cur.nodeType === 1) {
        const st = getComputedStyle(cur)
        if (st.backgroundImage && st.backgroundImage !== 'none') return null // gradients/images — skip
        const bg = parseRGB(st.backgroundColor)
        if (bg && bg.a > 0) {
          acc = acc ? over(acc, bg) : bg
          if (bg.a >= 1) return acc
        }
        cur = cur.parentElement
      }
      return acc ? over(acc, { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 255, b: 255, a: 1 }
    }
    const hasDirectText = (el) => {
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) return true
      return false
    }
    for (const el of all) {
      if (!hasDirectText(el) || !rendered(el) || inAriaHidden(el)) continue
      const st = getComputedStyle(el)
      const fg = parseRGB(st.color)
      if (!fg || fg.a === 0) continue
      const bg = effBg(el)
      if (!bg) continue
      const fgc = fg.a < 1 ? over(fg, bg) : fg
      const L1 = lum(fgc)
      const L2 = lum(bg)
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const size = parseFloat(st.fontSize)
      const bold = parseInt(st.fontWeight, 10) >= 700
      const large = size >= 24 || (bold && size >= 18.66)
      const min = large ? 3 : 4.5
      if (ratio < min - 0.05)
        push(warnings, 'color-contrast', 'serious', el, ratio.toFixed(2) + ':1 (needs ' + min + ':1, ' + Math.round(size) + 'px' + (bold ? ' bold' : '') + ')')
    }
  }

  return { violations, warnings }
}

export const checkerSource = a11yAudit.toString()
