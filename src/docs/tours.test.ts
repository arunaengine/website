import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SETTINGS_TAB_ANCHORS, navAnchor, navEntries } from '@/components/layout/nav'
import { docsTopics } from './v1'

const sourceRoot = fileURLToPath(new URL('..', import.meta.url))
const routes = readFileSync(join(sourceRoot, 'router/routes.ts'), 'utf8')

// Every source file a component statically imports, itself included.
function importTree(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !existsSync(file)) return seen
  seen.add(file)
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/(?:from |import\()'@\/([^']+)'/g)) {
    const base = join(sourceRoot, match[1])
    const path = [base, `${base}.ts`, join(base, 'index.ts')].find((candidate) => /\.(vue|ts)$/.test(candidate) && existsSync(candidate))
    if (path) importTree(path, seen)
  }
  return seen
}

function anchorsIn(files: Iterable<string>): Set<string> {
  const anchors = new Set<string>()
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/data-tour="([a-z0-9-]+)"/g)) anchors.add(match[1])
  }
  return anchors
}

// The view a tour route opens, read from the route table.
function viewFor(route: string): string {
  const path = route.replace(/^\/app\/?/, '').split('?')[0]
  const name = path === '' ? 'DashboardView' : new RegExp(`path: '${path}',[^{}]*?import\\('@/views/([A-Za-z]+)\\.vue'\\)`).exec(routes)?.[1]
  expect(name, route).toBeDefined()
  return join(sourceRoot, `views/${name}.vue`)
}

const shell = anchorsIn(importTree(join(sourceRoot, 'views/AppLayout.vue')))
for (const entry of navEntries({ desktop: false, isRealmAdmin: true, canInspectUsers: true, assistant: true })) {
  if (!('separator' in entry)) shell.add(navAnchor(entry.label))
}
const steps = docsTopics.flatMap((topic) => (topic.tour ?? []).map((step) => ({ topic: topic.slug, ...step })))

describe('guided tours', () => {
  it('spotlights a control of the shell or of the page the step opens', () => {
    for (const step of steps) {
      const page = anchorsIn(importTree(viewFor(step.route)))
      if (step.route.startsWith('/app/settings')) for (const anchor of Object.values(SETTINGS_TAB_ANCHORS)) page.add(anchor)
      expect(shell.has(step.anchor) || page.has(step.anchor), `${step.topic}: ${step.anchor} on ${step.route}`).toBe(true)
    }
  })

  it('never waits for a group or a bucket to be open', () => {
    // Tour routes name no group or bucket, so controls of an open one never show.
    const opened = anchorsIn([
      ...importTree(join(sourceRoot, 'components/groups/GroupDetail.vue')),
      ...importTree(join(sourceRoot, 'components/data/manager/ObjectBrowser.vue')),
    ])
    for (const step of steps) expect(opened.has(step.anchor), `${step.topic}: ${step.anchor}`).toBe(false)
  })
})
