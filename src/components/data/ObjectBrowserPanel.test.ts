import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('./ObjectBrowserPanel.vue', import.meta.url)),
  'utf8',
)
const descriptor = parse(source, { filename: 'ObjectBrowserPanel.vue' }).descriptor
const script = descriptor.scriptSetup?.content as string
const template = descriptor.template?.content as string

describe('Dialog browser session', () => {
  it('defaults the group through the shared selection', () => {
    expect(script).toContain('useGroupSelection(selectedGroupId)')
  })

  it('opens the selected group without a button', () => {
    // The same predicate as the Data view decides when a session opens.
    expect(script).toContain("from '@/composables/s3/context'")
    expect(script).toContain('shouldOpenContext({')
    expect(script).toContain('failedKey: failedContextKey')
    expect(template).not.toContain('Open group')
    expect(template).not.toContain('Open on this node')
  })

  it('opens a failed pair again only on request', () => {
    expect(script).toContain('failedContextKey = contextReady.value ? null : key')
    const errorBranch = template.indexOf('v-else-if="contextError && !contextReady"')
    expect(errorBranch).toBeGreaterThan(-1)
    expect(template.indexOf('@click="openSelectedContext"')).toBeGreaterThan(errorBranch)
  })

  it('opens the session on the required node', () => {
    expect(script).toContain('s3.activateContext(props.nodeId ?? null, selectedGroupId.value)')
    expect(script).toContain('context.nodeId === requiredNodeId.value')
  })

  it('switches the group from the context line', () => {
    expect(template).toContain('<DropdownMenuTrigger as-child>')
    expect(template).toContain('v-for="option in groupOptions"')
    expect(template).toContain('@click="selectedGroupId = option.value"')
    expect(template).toContain('v-if="option.value === selectedGroupId"')
    expect(template).toContain('on {{ requiredNodeName }}')
  })

  it('shows one placeholder while the session opens', () => {
    const gate = template.indexOf('<ObjectBrowserSkeleton v-else-if="contextBusy || !contextReady"')
    const browser = template.indexOf('<aside v-if="!controlled"')
    expect(gate).toBeGreaterThan(-1)
    expect(browser).toBeGreaterThan(gate)
  })

  it('keeps join-a-group out of the loading window', () => {
    expect(template).toContain('v-else-if="!groupsLoading && !hasGroups"')
  })
})
