import * as VueRuntime from 'vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { button, click, compileClientComponent, content, moduleDefault, mountApp } from '@/test/clientRender'
import type { RunPathCheck } from '@/lib/runPaths'

const PathChips = compileClientComponent(new URL('./PathChips.vue', import.meta.url), { vue: VueRuntime })

const CHECKS: RunPathCheck[] = [
  { path: '/work/in/reads.txt', kind: 'input', label: 'input', fix: null },
  { path: '/work/out/report.html', kind: 'missing-capture', label: 'not captured', fix: 'capture' },
  { path: '/work/in/annotation.gtf', kind: 'missing-input', label: 'not an input', fix: 'input' },
]

async function mount(canMountScript = false) {
  const events: Array<[string, string]> = []
  const record = (name: string) => (path: string) => events.push([name, path])
  const Harness = defineComponent(() => () =>
    h(PathChips, {
      label: 'Targets:',
      checks: CHECKS,
      canMountScript,
      onCapture: record('capture'),
      onAddInput: record('add-input'),
      onMountScript: record('mount-script'),
    }),
  )
  return { ...(await mountApp(Harness)), events }
}

describe('path chips', () => {
  it('states what covers each path', async () => {
    const mounted = await mount()

    expect(content(mounted.root)).toContain('Targets:')
    expect(content(mounted.root)).toContain('/work/in/reads.txt')
    expect(content(mounted.root)).toContain('not captured')
    mounted.app.unmount()
  })

  it('offers the one action that would cover an unassigned path', async () => {
    const mounted = await mount()

    await click(button(mounted.root, 'Capture'))
    await click(button(mounted.root, 'Add input'))

    expect(mounted.events).toEqual([
      ['capture', '/work/out/report.html'],
      ['add-input', '/work/in/annotation.gtf'],
    ])
    mounted.app.unmount()
  })

  it('mounts the script at a path while the run carries one', async () => {
    const without = await mount(false)
    expect(content(without.root)).not.toContain('Mount script here')
    without.app.unmount()

    const mounted = await mount(true)
    await click(button(mounted.root, 'Mount script here'))

    expect(mounted.events).toEqual([['mount-script', '/work/out/report.html']])
    mounted.app.unmount()
  })
})
