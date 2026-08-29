import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./GroupDetail.vue', import.meta.url)), 'utf8')
const { descriptor } = parse(source, { filename: 'GroupDetail.vue' })
const script = descriptor.scriptSetup?.content ?? ''
const template = descriptor.template?.content ?? ''
const switchWatch = script.slice(
  script.indexOf('watch(\n  () => props.groupId'),
  script.indexOf('watch(historyRange'),
)
const reload = script.slice(script.indexOf('async function reload()'), script.indexOf('watch(\n  () => props.groupId'))

describe('Group detail loading', () => {
  it('loads group, usage, members and datasets together', () => {
    const settled = reload.indexOf('Promise.allSettled')
    expect(settled).toBeGreaterThan(-1)
    for (const call of ['getGroup(', 'getGroupUsage(', 'listGroupMembers(', 'listGroupMetadata(']) {
      const at = reload.indexOf(call)
      expect(at).toBeGreaterThan(settled)
    }
  })

  it('renders the detail only after all four settled', () => {
    const settled = reload.indexOf('Promise.allSettled')
    const done = reload.indexOf('loadingDetail.value = false')
    expect(done).toBeGreaterThan(settled)
    expect(reload.split('loadingDetail.value = false')).toHaveLength(2)
  })

  it('keeps the usage and member failure semantics', () => {
    expect(reload).toContain("usage.value = groupUsage.status === 'fulfilled' ? groupUsage.value : null")
    expect(reload).toContain('groupMembers.reason instanceof ApiError && groupMembers.reason.status === 403')
    expect(reload).toContain('membersHidden.value = true')
    expect(reload).toContain('docsError.value = errorMessage(metadata.reason)')
  })

  it('drops stale responses of the group left behind', () => {
    expect(reload).toContain('const seq = ++reloadSeq')
    expect(reload).toContain('if (seq !== reloadSeq) return')
  })

  it('shows one placeholder, on first load and on a switch', () => {
    expect(template).toContain('<GroupDetailSkeleton v-if="loadingDetail && !group" />')
    expect(template).not.toContain('Loading group…')
    expect(switchWatch).toContain('group.value = null')
    expect(switchWatch).toContain('void reload()')
  })

  it('reserves the space of the tab counts', () => {
    expect(template).toContain('<Skeleton v-else class="h-5 w-6 rounded-full" />')
    expect(template.split('<Skeleton v-else class="h-5 w-6 rounded-full" />')).toHaveLength(3)
  })
})
