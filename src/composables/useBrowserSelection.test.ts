import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useBrowserSelection } from './useBrowserSelection'

const reads = { key: 'raw/reads.fastq', name: 'reads.fastq' }
const notes = { key: 'raw/notes.txt', name: 'notes.txt' }
const genomes = { prefix: 'raw/genomes/', name: 'genomes' }
const archive = { prefix: 'raw/archive/', name: 'archive' }

function selection(denied: string[] = []) {
  return useBrowserSelection({
    folders: ref([genomes, archive]),
    objects: ref([reads, notes]),
    canSelectObject: (key) => !denied.includes(key),
    canSelectFolder: (prefix) => !denied.includes(prefix),
  })
}

describe('object browser selection', () => {
  it('counts ticked folders beside ticked files', () => {
    const state = selection()

    state.setObjectSelected(reads.key, true)
    state.setFolderSelected(genomes.prefix, true)

    expect(state.selectedCount.value).toBe(2)
    expect([...state.selectedObjectKeys.value]).toEqual([reads.key])
    expect([...state.selectedPrefixes.value]).toEqual([genomes.prefix])
  })

  it('ticks everything the session may delete', () => {
    const state = selection([archive.prefix])

    state.setAllListedSelected(true)

    expect(state.selectableListedCount.value).toBe(3)
    expect(state.allListedSelected.value).toBe(true)
    expect(state.selectedPrefixes.value.has(archive.prefix)).toBe(false)
    expect(state.selectedCount.value).toBe(3)
  })

  it('reports a partial selection as neither all nor empty', () => {
    const state = selection()

    state.setFolderSelected(genomes.prefix, true)

    expect(state.someListedSelected.value).toBe(true)
    expect(state.allListedSelected.value).toBe(false)
  })

  it('drops both halves when the listing is replaced', () => {
    // Navigating to another prefix or bucket resets the listing.
    const state = selection()
    state.setAllListedSelected(true)

    state.clearSelection()

    expect(state.selectedCount.value).toBe(0)
  })

  it('drops what a folder deletion removed', () => {
    const state = selection()
    state.setObjectSelected(reads.key, true)
    state.setFolderSelected(genomes.prefix, true)
    state.setFolderSelected(archive.prefix, true)

    state.pruneSelection({ kind: 'prefix', bucket: 'reef', prefix: 'raw/genomes/' })

    expect(state.selectedCount.value).toBe(2)
    expect(state.selectedPrefixes.value.has(genomes.prefix)).toBe(false)
  })

  it('empties the selection when the bucket is deleted', () => {
    const state = selection()
    state.setAllListedSelected(true)

    state.pruneSelection({ kind: 'bucket', bucket: 'reef' })

    expect(state.selectedCount.value).toBe(0)
  })

  it('keeps a failed entry selected after a completed delete', () => {
    const state = selection()
    state.setObjectSelected(reads.key, true)
    state.setFolderSelected(genomes.prefix, true)
    state.setFolderSelected(archive.prefix, true)

    state.dropCommitted([reads.key, genomes.prefix])

    expect([...state.selectedObjectKeys.value]).toEqual([])
    expect([...state.selectedPrefixes.value]).toEqual([archive.prefix])
  })
})
