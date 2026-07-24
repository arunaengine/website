import { ref, watch, type Ref } from 'vue'

// Shared Tree|Table preference for the container-data editors (quick run and
// the full task wizard), persisted per browser.
const STORAGE_KEY = 'aruna.computeDataView'

export type ComputeDataView = 'tree' | 'table'

export function useComputeDataView(): Ref<ComputeDataView> {
  const dataView = ref<ComputeDataView>(localStorage.getItem(STORAGE_KEY) === 'table' ? 'table' : 'tree')
  watch(dataView, (view) => localStorage.setItem(STORAGE_KEY, view))
  return dataView
}
