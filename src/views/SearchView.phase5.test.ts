import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'
import { datasetPurposeLabel, datasetPurposeMatches, datasetPurposeOf } from './SearchView.vue'

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

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

  it('uses the decided visible labels and the four type options', () => {
    expect(datasetPurposeLabel('dataset')).toBe('Dataset')
    expect(datasetPurposeLabel('profile')).toBe('Profile')
    expect(datasetPurposeLabel('process-run')).toBe('Process Run')
    expect(datasetPurposeLabel('unknown')).toBe('Purpose unknown')

    const filters = read('../components/datasets/DatasetFilters.vue')
    const hits = read('../components/datasets/DatasetHits.vue')
    const search = read('../composables/useDatasetSearch.ts')

    expect(filters).toContain("{ key: 'type', label: 'Type', options: typeFacetOptions, multi: true }")
    expect(hits).toContain('text-muted-foreground">Purpose unknown</span>')
    expect(search).toContain('profileReferenceIri(profile)')
    expect(search).not.toContain("document_path.startsWith('profiles/')")
  })
})

describe('Datasets page layout', () => {
  const view = read('./SearchView.vue')
  const actions = view.slice(view.indexOf('<template #actions>'), view.indexOf('</PageHeader>'))

  it('leads the header with New dataset, Presets and Import, the rest in one menu', () => {
    expect(actions).toContain("name: 'dataset-new'")
    expect(actions).toContain("name: 'presets'")
    expect(actions).toContain('Import an RO-Crate, a repository record or a dataset from another realm')
    expect(actions).toContain('<RefreshButton')
    expect(actions).toContain('aria-label="More actions"')
    expect(actions).toContain('SPARQL workbench')
  })

  it('shows run records in the one list and turns their old tab into a type filter', () => {
    expect(view).toContain("type: 'process-run,workflow-run'")
    expect(view).toContain('<DatasetBrowse v-else :state="state" />')
    expect(read('./MetadataView.vue')).not.toContain("tab: 'records'")
  })
})
