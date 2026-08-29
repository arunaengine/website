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

  it('keeps create or join out of the loading window', () => {
    const loadingBranch = template.indexOf('v-else-if="groupsLoading"')
    const createBranch = template.indexOf('v-else-if="!selectedGroupId"')
    expect(loadingBranch).toBeGreaterThan(-1)
    expect(createBranch).toBeGreaterThan(loadingBranch)
  })

  it('keeps create or join for a user without groups', () => {
    expect(template).toContain("<RouterLink :to=\"{ name: 'groups' }\">Create or join a group</RouterLink>")
  })
})
