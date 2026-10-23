// The database buckets of the node mock: buckets with a description, kept in memory so a
// realm admin can edit them. A new mark waits for the group admins of the owning group.
import { computed, ref } from 'vue'
import { DATABASES_START, REALM_ROLES, type DatabaseEntry, type RealmRole } from '@/lib/distributedMockData'

const all = ref<DatabaseEntry[]>(DATABASES_START.map((entry) => ({ ...entry })))
// Realm roles that hold WRITE on the path that allows marking database buckets.
const curators = ref<RealmRole[]>(REALM_ROLES.filter((role) => role.name === 'Database curators').map((role) => ({ ...role })))

export function useMockDatabases() {
  // Only agreed marks count for lists, Add data and search.
  const entries = computed(() => all.value.filter((entry) => entry.status === 'agreed'))

  function add(entry: Omit<DatabaseEntry, 'id' | 'status'>) {
    all.value = [...all.value, { ...entry, id: `${entry.bucket}-${all.value.length + 1}`, status: 'pending' }]
  }

  function agree(id: string) {
    all.value = all.value.map((entry) => (entry.id === id ? { ...entry, status: 'agreed' } : entry))
  }

  function update(id: string, patch: Partial<Omit<DatabaseEntry, 'id' | 'bucket' | 'status'>>) {
    all.value = all.value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
  }

  function remove(id: string) {
    all.value = all.value.filter((entry) => entry.id !== id)
  }

  function grant(role: RealmRole) {
    if (!curators.value.some((item) => item.name === role.name)) curators.value = [...curators.value, role]
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

  return { entries, all, curators, add, agree, update, remove, grant, search }
}
