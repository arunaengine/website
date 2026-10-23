// The database buckets of the node mock: buckets with a description, kept in memory so a realm admin can edit them.
import { ref } from 'vue'
import { DATABASES_START, type DatabaseEntry } from '@/lib/distributedMockData'

const entries = ref<DatabaseEntry[]>(DATABASES_START.map((entry) => ({ ...entry })))

export function useMockDatabases() {
  function add(entry: Omit<DatabaseEntry, 'id'>) {
    entries.value = [...entries.value, { ...entry, id: `${entry.bucket}-${entries.value.length + 1}` }]
  }

  function update(id: string, patch: Partial<Omit<DatabaseEntry, 'id' | 'bucket'>>) {
    entries.value = entries.value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
  }

  function remove(id: string) {
    entries.value = entries.value.filter((entry) => entry.id !== id)
  }

  // Entries whose name, description or source contain every word of the query.
  function search(query: string): DatabaseEntry[] {
    const words = query.toLowerCase().split(/\s+/).filter((word) => word.length >= 2)
    if (!words.length) return []
    return entries.value.filter((entry) => {
      const text = `${entry.name} ${entry.description} ${entry.source}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }

  return { entries, add, update, remove, search }
}
