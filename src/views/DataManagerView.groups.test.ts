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
  it('follows the group the top bar holds', () => {
    expect(managerSource).toContain('useGroupContext(selectedGroupId)')
  })

  it('opens the selected group without a button', () => {
    expect(managerSource).toContain('shouldOpenContext({')
    expect(template).not.toContain('Open group')
    expect(template).not.toContain('Open on this node')
    expect(template).not.toContain('Session active')
  })

  it('shows the group without a second picker', () => {
    const actions = template.slice(template.indexOf('<template #actions>'), template.indexOf('</PageHeader>'))
    // The node choice is one outline button in the header; its tooltip names the top bar's group.
    expect(actions).toContain('<NodePicker')
    expect(actions).toContain('button')
    expect(actions).toContain('Showing buckets of the group ${selectedGroupName')
    expect(template).not.toContain('Showing buckets of</span>')
    expect(template).not.toContain('groupOptions')
    expect(template).not.toContain('DropdownMenu')
  })

  it('names the open bucket node in the heading and keeps Refresh on the right', () => {
    const title = template.slice(template.indexOf('<template #title>'), template.indexOf('<template #description>'))
    // The node of the open bucket stays named in the heading, linked to its page.
    expect(title).toContain(`on <RouterLink :to="{ name: 'node', params: { nodeId: requiredNodeId } }" class="text-primary hover:underline">{{ headerPlace.name }}</RouterLink>`)
    expect(title).toContain(':title="headerPlace.title"')
    // A spread bucket names its node count and links each node from the popover.
    expect(title).toContain('{{ spreadNodes.length }} nodes')
    expect(title).toContain(":to=\"{ name: 'node', params: { nodeId: id } }\"")
    const actions = template.slice(template.indexOf('<template #actions>'), template.indexOf('</PageHeader>'))
    expect(actions).toContain('<RefreshButton')
  })

  it('keeps a route group as the opened one', () => {
    expect(managerSource).toContain("routeString(route.query.group) || s3.activeContext.value?.groupId")
    expect(managerSource).toContain('if (next) selectedGroupId.value = next')
  })

  it('lets only a group-changing search hit skip the switch', () => {
    expect(managerSource).toContain('if (hit.group_id !== selectedGroupId.value) hitGroupId = hit.group_id')
  })

  it('retries a failed session on request', () => {
    const errorBranch = template.indexOf('v-else-if="contextError && !contextReady"')
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

  it('opens New bucket from the create query and drops the marker', () => {
    expect(viewSource).toMatch(/\(\) => route\.query\.create,[\s\S]*?create !== 'bucket'[\s\S]*?newBucketOpen\.value = true[\s\S]*?router\.replace\(\{ query: rest \}\)/)
  })

  it('hands a referenced bucket to the list import on its own node', () => {
    expect(viewSource).toContain('remoteNodeId.value !== pending.nodeId')
    expect(template).toContain(':node-id="remoteNodeId"')
  })

  it('opens Upload files only once a bucket is chosen', () => {
    expect(viewSource).toContain("if (flag === '1') uploadPending.value = true")
    expect(viewSource).toContain('if (!uploadPending.value || !bucket.value || !contextReady.value) return')
    expect(template).toContain('Choose a bucket to upload files to.')
  })

  it('shows one placeholder instead of stacked loading states', () => {
    expect(template.split('<DataViewSkeleton')).toHaveLength(3)
    expect(template).not.toContain('<Spinner')
  })
})
