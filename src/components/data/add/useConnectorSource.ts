import { computed, ref, watch, type Ref } from 'vue'
import { useAruna } from '@/composables/useAruna'
import { invalidSourcePath, invalidSourcePrefix } from '@/composables/useStaging'
import { errorMessage } from '@/lib/utils'
import type { ConnectorEntry, SourceConnectorSummary, StagingReferenceEntry } from '@/lib/api'

export const STRATEGY_OPTIONS = [
  { value: 'snapshot', label: 'Snapshot: copy the source into the bucket' },
  { value: 'reference', label: 'Reference: register without copying; read on demand' },
]

export interface ConnectorStagingRow {
  source: string
  strategy: 'snapshot' | 'reference'
  groupId: string
  connectorId: string
  connectorName: string | null
  isPrefix?: boolean
  targetKey?: string
}

// Connector-tab state lives outside the tab component: radix unmounts inactive
// tab panels, and a switch away must not drop the selection.
export function useConnectorSource(options: {
  open: Ref<boolean>
  groupId: Ref<string | null>
  prefix: Ref<string>
  existingReferences: Ref<readonly StagingReferenceEntry[] | undefined>
}) {
  const { myGroups, listGroupConnectors } = useAruna()

  const groupSel = ref('')
  const connectors = ref<SourceConnectorSummary[]>([])
  const connectorsLoading = ref(false)
  const connectorsError = ref<string | null>(null)
  const registerOpen = ref(false)
  let connLoadSeq = 0

  const groupOptions = computed(() => myGroups.value.map((group) => ({ value: group.id, label: group.name })))

  async function loadConnectors() {
    const groupId = groupSel.value
    if (!groupId) {
      connectors.value = []
      return
    }
    const seq = ++connLoadSeq
    connectorsLoading.value = true
    connectorsError.value = null
    try {
      const response = await listGroupConnectors(groupId)
      if (seq !== connLoadSeq) return
      connectors.value = response.connectors
    } catch (err) {
      if (seq !== connLoadSeq) return
      connectorsError.value = errorMessage(err)
      connectors.value = []
    } finally {
      if (seq === connLoadSeq) connectorsLoading.value = false
    }
  }
  watch(groupSel, loadConnectors)

  function onConnectorSaved(connector: SourceConnectorSummary) {
    connectorSel.value = connector.connector_id
    void loadConnectors()
  }

  const connectorOptions = computed(() =>
    connectors.value.map((connector) => ({ value: connector.connector_id, label: `${connector.name} (${connector.kind})` })),
  )

  const connectorSel = ref('')
  const connectorStrategy = ref<'snapshot' | 'reference'>('snapshot')
  // Set when the entries endpoint is absent on this node; the typed source path
  // stays available as the fallback.
  const entriesUnsupported = ref(false)
  // Set when the node answered but the source refused a listing (502/504); the
  // browser stays visible for retries and the typed path unlocks alongside it.
  const entriesListingFailed = ref(false)
  const connectorPath = ref('')

  watch(connectors, () => {
    if (!connectors.value.some((connector) => connector.connector_id === connectorSel.value)) {
      connectorSel.value = connectors.value[0]?.connector_id ?? ''
    }
  })
  watch(connectorSel, () => {
    entriesUnsupported.value = false
    entriesListingFailed.value = false
  })

  function typedConnectorPathIsPrefix(path: string): boolean {
    const trimmed = path.trim()
    return trimmed === '.' || trimmed === './' || trimmed.endsWith('/')
  }

  const connectorPathError = computed(() => {
    if (!connectorPath.value.trim()) return false
    return typedConnectorPathIsPrefix(connectorPath.value)
      ? invalidSourcePrefix(connectorPath.value)
      : invalidSourcePath(connectorPath.value)
  })
  const existingConnectorReferenceKeys = computed(() => {
    const map = new Map<string, string>()
    for (const entry of options.existingReferences.value ?? []) {
      if (entry.referenced && entry.connector_id === connectorSel.value && entry.source_path) {
        map.set(entry.source_path, entry.key)
      }
    }
    return map
  })
  const existingConnectorPaths = computed<ReadonlySet<string>>(
    () => new Set(existingConnectorReferenceKeys.value.keys()),
  )

  function selectedConnectorName(): string | null {
    return connectors.value.find((connector) => connector.connector_id === connectorSel.value)?.name ?? null
  }

  function selectionRows(selection: { files: ConnectorEntry[]; dirs: ConnectorEntry[] }): ConnectorStagingRow[] {
    if (!groupSel.value || !connectorSel.value) return []
    const base = {
      strategy: connectorStrategy.value,
      groupId: groupSel.value,
      connectorId: connectorSel.value,
      connectorName: selectedConnectorName(),
    }
    return [
      ...selection.files.map((entry) => ({
        ...base,
        source: entry.path,
        targetKey: existingConnectorReferenceKeys.value.get(entry.path),
      })),
      ...selection.dirs.map((entry) => ({ ...base, source: `${entry.path.replace(/\/+$/, '')}/`, isPrefix: true })),
    ]
  }

  function typedPathRows(): ConnectorStagingRow[] {
    const source = connectorPath.value.trim()
    const isPrefix = typedConnectorPathIsPrefix(source)
    if (!groupSel.value || !connectorSel.value || (isPrefix ? invalidSourcePrefix(source) : invalidSourcePath(source))) return []
    const rows = [
      {
        source,
        strategy: connectorStrategy.value,
        groupId: groupSel.value,
        connectorId: connectorSel.value,
        connectorName: selectedConnectorName(),
        ...(isPrefix ? { isPrefix: true } : {}),
        ...(source === '.' || source === './' ? { targetKey: options.prefix.value } : {}),
      },
    ]
    connectorPath.value = ''
    return rows
  }

  watch(
    options.open,
    (open) => {
      if (!open) return
      const groups = myGroups.value
      groupSel.value =
        options.groupId.value && groups.some((group) => group.id === options.groupId.value)
          ? options.groupId.value
          : ''
      void loadConnectors()
    },
    { immediate: true },
  )

  return {
    groupSel,
    groupOptions,
    connectors,
    connectorsLoading,
    connectorsError,
    registerOpen,
    connectorSel,
    connectorOptions,
    connectorStrategy,
    entriesUnsupported,
    entriesListingFailed,
    connectorPath,
    connectorPathError,
    existingConnectorPaths,
    onConnectorSaved,
    selectionRows,
    typedPathRows,
  }
}

export type ConnectorSource = ReturnType<typeof useConnectorSource>
