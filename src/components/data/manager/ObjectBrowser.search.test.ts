import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const template = (path: string) => parse(readFileSync(new URL(path, import.meta.url), 'utf8')).descriptor.template?.content ?? ''

describe('one search box in the bucket view', () => {
  it('has no second box above the folder, nor its helper sentence', () => {
    expect(template('../../../views/DataManagerView.vue')).not.toContain('<MetadataSearch')
    expect(template('../MetadataSearch.vue')).not.toContain('<input')
    expect(template('../MetadataSearch.vue')).not.toContain('Finds file names and imported details')
  })
})
