import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import { datasetPurposeLabel, datasetPurposeMatches, datasetPurposeOf } from './SearchView.vue'

describe('Datasets purpose filters', () => {
  it('classifies the three purposes with Profile taking precedence', () => {
    expect(datasetPurposeOf({ type: 'Dataset', conformsToIds: [] })).toBe('dataset')
    expect(datasetPurposeOf({ type: 'Dataset', conformsToIds: [PROCESS_RUN_PROFILE_URI] })).toBe('process-run')
    expect(datasetPurposeOf({ type: 'http://www.w3.org/ns/dx/prof/Profile, Dataset', conformsToIds: [] })).toBe('profile')
    expect(datasetPurposeOf({ type: 'prof:Profile, Dataset', conformsToIds: [PROCESS_RUN_PROFILE_URI] })).toBe('profile')
    expect(datasetPurposeOf()).toBe('unknown')
  })

  it('keeps id-only hits visible under every purpose filter', () => {
    expect(datasetPurposeMatches(undefined, 'dataset')).toBe(true)
    expect(datasetPurposeMatches(undefined, 'profile')).toBe(true)
    expect(datasetPurposeMatches(undefined, 'process-run')).toBe(true)
    expect(datasetPurposeMatches({ type: 'Dataset', conformsToIds: [] }, 'profile')).toBe(false)
  })

  it('uses the decided visible labels and fixed purpose options', () => {
    expect(datasetPurposeLabel('dataset')).toBe('Dataset')
    expect(datasetPurposeLabel('profile')).toBe('Profile')
    expect(datasetPurposeLabel('process-run')).toBe('Process Run')
    expect(datasetPurposeLabel('unknown')).toBe('Purpose unknown')

    const source = readFileSync(fileURLToPath(new URL('./SearchView.vue', import.meta.url)), 'utf8')
    expect(source).toContain("{ value: 'dataset', label: 'Dataset' }")
    expect(source).toContain("{ value: 'profile', label: 'Profile' }")
    expect(source).toContain("{ value: 'process-run', label: 'Process Run' }")
    expect(source).toContain('datasetPurposeLabel(datasetPurposeOf(line.doc))')
    expect(source).toContain('text-muted-foreground">Purpose unknown</span>')
    expect(source).not.toContain('class="w-fit text-[10px] uppercase">Dataset</Badge>')
    expect(source).not.toContain('class="w-fit text-[10px] uppercase">Profile</Badge>')
    expect(source).not.toContain('class="w-fit text-[10px] uppercase">Process Run</Badge>')
    expect(source).toContain('profileReferenceIri(profile)')
    expect(source).not.toContain("document_path.startsWith('profiles/')")
  })
})
