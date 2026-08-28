<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import ConnectorEntriesBrowser from '@/components/data/ConnectorEntriesBrowser.vue'
import { OFFLINE_WRITE_HINT, useConnectivity } from '@/lib/connectivity'
import type { ConnectorEntry } from '@/lib/api'
import { Plus } from '@lucide/vue'
import { STRATEGY_OPTIONS, type ConnectorSource, type ConnectorStagingRow } from './useConnectorSource'

const props = defineProps<{ source: ConnectorSource }>()
const emit = defineEmits<{
  (e: 'add', rows: ConnectorStagingRow[]): void
  (e: 'navigate'): void
}>()

const { writesDisabled } = useConnectivity()
const {
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
} = props.source

function addConnectorSelection(selection: { files: ConnectorEntry[]; dirs: ConnectorEntry[] }) {
  const rows = props.source.selectionRows(selection)
  if (rows.length) emit('add', rows)
}

function addTypedConnectorPath() {
  const rows = props.source.typedPathRows()
  if (rows.length) emit('add', rows)
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <div>
      <label class="text-xs font-medium text-foreground">Group</label>
      <GroupSelect
        v-model="groupSel"
        :options="groupOptions"
        placeholder="Select a group"
        class="mt-1"
        @navigate="emit('navigate')"
      />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Source connector</label>
      <Select
        v-model="connectorSel"
        :options="connectorOptions"
        placeholder="Select a connector"
        class="mt-1"
        :disabled="!connectorOptions.length"
      />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Strategy</label>
      <Select v-model="connectorStrategy" :options="STRATEGY_OPTIONS" class="mt-1" />
    </div>
  </div>

  <Spinner v-if="connectorsLoading" show-label label="Loading connectors…" />
  <Notice v-else-if="connectorsError" tone="error">
    {{ connectorsError }}
  </Notice>
  <EmptyState
    v-else-if="!connectors.length"
    title="No source connectors"
    description="This group has no registered source connectors yet. Register one to ingest data from an external HTTP, S3, WebDAV, or FTP source."
  >
    <Button
      v-if="groupSel"
      size="sm"
      :disabled="writesDisabled"
      :title="writesDisabled ? OFFLINE_WRITE_HINT : undefined"
      @click="registerOpen = true"
    >
      <Plus class="h-3.5 w-3.5" /> Register a connector
    </Button>
  </EmptyState>

  <template v-else-if="connectorSel">
    <ConnectorEntriesBrowser
      v-if="!entriesUnsupported"
      :group-id="groupSel"
      :connector-id="connectorSel"
      :checked-paths="existingConnectorPaths"
      selectable
      @add="addConnectorSelection"
      @unsupported="entriesUnsupported = true"
      @list-failed="entriesListingFailed = true"
    />
    <div v-if="entriesUnsupported || entriesListingFailed" class="space-y-2">
      <Notice v-if="entriesUnsupported" tone="warning">
        Browsing connector contents is not supported by this node yet. Type the source path instead.
      </Notice>
      <div>
        <label class="text-xs font-medium text-foreground">Source path</label>
        <div class="mt-1 flex items-center gap-2">
          <Input v-model="connectorPath" class="font-mono text-xs" placeholder="folder/file.fastq.gz" @keyup.enter="addTypedConnectorPath" />
          <Button size="sm" class="shrink-0" :disabled="!connectorPath.trim() || connectorPathError" @click="addTypedConnectorPath">
            <Plus class="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        <p v-if="connectorPathError" class="mt-1 text-[11px] text-destructive">
          Use a relative path without leading '/', backslashes, or '.'/'..' segments.
        </p>
        <p v-else class="mt-1 text-[11px] text-muted-foreground">
          End a folder path with '/' or use '.' to add the connector root.
        </p>
      </div>
    </div>
    <div class="flex justify-end">
      <button class="text-xs text-primary hover:underline" @click="registerOpen = true">Register another connector</button>
    </div>
  </template>
</template>
