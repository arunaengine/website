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

  it('shows the group without a group or node picker in the header', () => {
    const actions = template.slice(template.indexOf('<template #actions>'), template.indexOf('</PageHeader>'))
    // The bucket list's filter picks a node; the header keeps only Refresh.
    expect(actions).not.toContain('<NodePicker')
    expect(template).not.toContain('Showing buckets of</span>')
    expect(template).not.toContain('groupOptions')
  })

  it('names the open bucket node in the heading and keeps Refresh on the right', () => {
    const title = template.slice(template.indexOf('<template #title>'), template.indexOf('<template #description>'))
    // Up to two nodes are chips linked to their pages; the one node keeps its place name and title.
    expect(title).not.toContain('on <RouterLink')
    expect(title).toContain('v-if="headerNodes.length <= 2"')
    expect(title).toContain(':title="headerNodes.length === 1 ? headerPlace.title')
    // Three or more collapse into one "N nodes" menu that links each node.
    expect(title).toContain('{{ headerNodes.length }}&nbsp;nodes')
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
