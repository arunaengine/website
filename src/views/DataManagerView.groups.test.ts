import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const viewSource = readFileSync(
  fileURLToPath(new URL('./DataManagerView.vue', import.meta.url)),
  'utf8',
)
const managerSource = readFileSync(
  fileURLToPath(new URL('../composables/useDataManager.ts', import.meta.url)),
  'utf8',
)
const template = parse(viewSource, { filename: 'DataManagerView.vue' }).descriptor.template
  ?.content as string

describe('Data view group selection', () => {
  it('defaults the group through the shared selection', () => {
    expect(managerSource).toContain('useGroupSelection(selectedGroupId)')
  })

  it('opens the selected group without a button', () => {
    expect(managerSource).toContain('shouldOpenContext({')
    expect(template).not.toContain('Open group')
    expect(template).not.toContain('Open on this node')
    expect(template).not.toContain('Session active')
  })

  it('switches the group from the context line', () => {
    expect(template).toContain('Showing buckets of')
    expect(template).toContain('on {{ requiredNodeName }}')
    expect(template).toContain('<DropdownMenuTrigger as-child>')
    expect(template).toContain('v-for="option in groupOptions"')
    expect(template).toContain('@click="selectedGroupId = option.value"')
  })

  it('retries a failed session on request', () => {
    const errorBranch = template.indexOf('v-else-if="contextError"')
    expect(errorBranch).toBeGreaterThan(-1)
    expect(template.indexOf('@click="openSelectedContext"')).toBeGreaterThan(errorBranch)
  })

  it('keeps create or join out of the loading window', () => {
    expect(template).toContain('v-else-if="!groupsLoading && !hasGroups"')
  })

  it('keeps create or join for a user without groups', () => {
    expect(template).toContain("<RouterLink :to=\"{ name: 'groups' }\">Create or join a group</RouterLink>")
  })

  it('gates the browser on one readiness condition', () => {
    const gate = template.indexOf('<DataViewSkeleton v-else-if="contextBusy || !viewReady" />')
    const browser = template.indexOf('<section v-else class="grid')
    expect(gate).toBeGreaterThan(-1)
    expect(browser).toBeGreaterThan(gate)
  })

  it('shows one placeholder instead of stacked loading states', () => {
    expect(template.split('<DataViewSkeleton')).toHaveLength(3)
    expect(template).not.toContain('<Spinner')
  })
})
