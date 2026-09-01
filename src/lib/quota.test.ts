import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { UsageResponse } from './api'
import * as quota from './quota'

describe('quota counter contract', () => {
  it('does not export a derived reference-object count', () => {
    expect(quota).not.toHaveProperty('referencedObjectCount')
    expect(quota).not.toHaveProperty('storedReferencedHint')
  })

  it('keeps realm logical and referenced byte selection unchanged', () => {
    const usage = {
      logical_bytes: 3,
      referenced_bytes: 5,
      realm: { logical_bytes: 7, referenced_bytes: 11 },
    } as UsageResponse

    expect(quota.quotaCountedBytes(usage)).toBe(7)
    expect(quota.referencedBytes(usage)).toBe(11)
  })
})

describe('physical blob labels', () => {
  it.each([
    '../views/StatusView.vue',
    '../views/AdminView.vue',
    '../components/groups/GroupDetail.vue',
    '../components/nodes/NodeDetailPanel.vue',
  ])('%s labels stored_blobs without deriving references', (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
    expect(source).toContain('physical blob locations')
    expect(source).not.toContain('storedReferencedHint')
    expect(source).not.toContain('referencedObjectCount')
  })
})
