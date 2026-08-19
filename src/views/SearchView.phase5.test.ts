import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import { datasetPurposeLabel, datasetPurposeOf } from './SearchView.vue'

describe('Datasets purpose filters', () => {
  it('classifies the three purposes with Profile taking precedence', () => {
    expect(datasetPurposeOf({ type: 'Dataset', conformsToIds: [] })).toBe('dataset')
    expect(datasetPurposeOf({ type: 'Dataset', conformsToIds: [PROCESS_RUN_PROFILE_URI] })).toBe('process-run')
    expect(datasetPurposeOf({ type: 'http://www.w3.org/ns/dx/prof/Profile, Dataset', conformsToIds: [] })).toBe('profile')
    expect(datasetPurposeOf({ type: 'prof:Profile, Dataset', conformsToIds: [PROCESS_RUN_PROFILE_URI] })).toBe('profile')
  })

  it('uses the decided visible labels and fixed purpose options', () => {
    expect(datasetPurposeLabel('dataset')).toBe('Dataset')
    expect(datasetPurposeLabel('profile')).toBe('Profile')
    expect(datasetPurposeLabel('process-run')).toBe('Process Run')

    const source = readFileSync(fileURLToPath(new URL('./SearchView.vue', import.meta.url)), 'utf8')
    expect(source).toContain("{ value: 'dataset', label: 'Dataset' }")
    expect(source).toContain("{ value: 'profile', label: 'Profile' }")
    expect(source).toContain("{ value: 'process-run', label: 'Process Run' }")
    expect(source).toContain('datasetPurposeLabel(datasetPurposeOf(line.doc))')
    expect(source).not.toContain("document_path.startsWith('profiles/')")
  })
})
