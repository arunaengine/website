// Databases of the node mock: a bucket plus a linked dataset that describes it. Datasets can
// link buckets and folders as live parts. Everything is kept in memory so the mock can edit it.
import { computed, ref } from 'vue'
import {
  DATABASES_START,
  DATASETS_START,
  OWNING_GROUP,
  REALM_ROLES,
  type DatabaseEntry,
  type ExampleDataset,
  type LinkedPart,
  type RealmRole,
} from '@/lib/distributedMockData'

export interface ResolvedDatabase extends DatabaseEntry {
  dataset: ExampleDataset
}

export interface PartOf {
  dataset: ExampleDataset
  part: LinkedPart
  database: boolean
}

export const NEW_DATASET = 'new-dataset'

const datasets = ref<ExampleDataset[]>(DATASETS_START.map((dataset) => ({ ...dataset, parts: dataset.parts.map((part) => ({ ...part })) })))
const marks = ref<DatabaseEntry[]>(DATABASES_START.map((entry) => ({ ...entry })))
// Realm roles that hold WRITE on the path that allows marking databases.
const curators = ref<RealmRole[]>(REALM_ROLES.filter((role) => role.name === 'Database curators').map((role) => ({ ...role })))

// Only a direct bucket or folder link covers files. A linked database is dataset metadata.
function covers(part: LinkedPart, bucket: string, key: string): boolean {
  return part.kind !== 'database' && part.bucket === bucket && (!part.prefix || key.startsWith(`${part.prefix}/`))
}

export function useMockDatabases() {
  const all = computed<ResolvedDatabase[]>(() =>
    marks.value.flatMap((entry) => {
      const dataset = datasets.value.find((item) => item.id === entry.datasetId)
      return dataset ? [{ ...entry, dataset }] : []
    }),
  )
  // Only agreed marks count for lists, Add data and search.
  const entries = computed(() => all.value.filter((entry) => entry.status === 'agreed'))
  const own = (group: string) => datasets.value.filter((dataset) => dataset.group === group)

  // Marks a bucket as a database. A new dataset is named after the bucket and links it.
  function add(bucket: string, datasetId: string) {
    let target = datasetId
    if (datasetId === NEW_DATASET) {
      target = `01K8Z0DS0NEW${String(datasets.value.length).padStart(14, '0')}`
      datasets.value = [
        ...datasets.value,
        { id: target, name: bucket, description: '', license: '', creator: 'You', source: '', group: OWNING_GROUP[bucket] ?? '', parts: [] },
      ]
    }
    datasets.value = datasets.value.map((dataset) =>
      dataset.id === target && !dataset.parts.some((part) => part.kind === 'bucket' && part.bucket === bucket)
        ? { ...dataset, parts: [...dataset.parts, { kind: 'bucket', bucket }] }
        : dataset,
    )
    marks.value = [...marks.value, { id: `${bucket}-${marks.value.length + 1}`, bucket, datasetId: target, readers: 'Everyone in the realm', status: 'pending' }]
  }

  function agree(id: string) {
    marks.value = marks.value.map((entry) => (entry.id === id ? { ...entry, status: 'agreed' } : entry))
  }

  function remove(id: string) {
    marks.value = marks.value.filter((entry) => entry.id !== id)
  }

  function linkPart(datasetId: string, part: LinkedPart) {
    datasets.value = datasets.value.map((dataset) => (dataset.id === datasetId ? { ...dataset, parts: [...dataset.parts, part] } : dataset))
  }

  function grant(role: RealmRole) {
    if (!curators.value.some((item) => item.name === role.name)) curators.value = [...curators.value, role]
  }

  // Datasets that link the bucket, or a folder of it, as a part.
  function linkedBy(bucket: string): { dataset: ExampleDataset; part: LinkedPart }[] {
    return datasets.value.flatMap((dataset) => dataset.parts.filter((part) => part.kind !== 'database' && part.bucket === bucket).map((part) => ({ dataset, part })))
  }

  // Every file inside a linked part is part of the dataset. Nothing is stored per file.
  function partOf(bucket: string, key: string): PartOf[] {
    return datasets.value.flatMap((dataset) =>
      dataset.parts
        .filter((part) => covers(part, bucket, key))
        .map((part) => ({ dataset, part, database: entries.value.some((entry) => entry.datasetId === dataset.id) })),
    )
  }

  // Databases whose dataset name, description or source contain every word of the query.
  function search(query: string): ResolvedDatabase[] {
    const words = query.toLowerCase().split(/\s+/).filter((word) => word.length >= 2)
    if (!words.length) return []
    return entries.value.filter((entry) => {
      const text = `${entry.dataset.name} ${entry.dataset.description} ${entry.dataset.source}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }

  return { entries, all, datasets, curators, own, add, agree, remove, linkPart, grant, linkedBy, partOf, search }
}
