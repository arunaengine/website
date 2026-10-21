<script setup lang="ts">
// The red box of a permanent delete: what goes in Aruna, what goes in your storage, what stays.
import type { DeleteImpact } from '@/lib/api'
import { filesWord } from '@/lib/organize'
import { formatBytes, formatNumber } from '@/lib/utils'

defineProps<{ impact: DeleteImpact; label: string }>()
</script>

<template>
  <div class="space-y-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3" data-testid="delete-impact">
    <p class="text-sm font-semibold text-destructive">Delete {{ label }} permanently</p>
    <p class="text-sm text-foreground">
      This deletes <b>{{ filesWord(impact.files) }} with all {{ formatNumber(impact.versions) }} {{ impact.versions === 1 ? 'version' : 'versions' }}</b>
      in Aruna<template v-if="impact.storage_files">
        and <b>{{ filesWord(impact.storage_files) }} ({{ formatBytes(impact.storage_bytes) }})</b> in your storage</template>.
    </p>
    <p v-if="!impact.storage_files" class="text-xs text-muted-foreground">No files are deleted in your storage.</p>
    <p v-if="impact.kept_files" class="text-xs text-muted-foreground">
      {{ filesWord(impact.kept_files) }} in your storage {{ impact.kept_files === 1 ? 'stays' : 'stay' }} because other links or files still use
      {{ impact.kept_files === 1 ? 'it' : 'them' }}.
    </p>
    <p class="text-xs font-medium text-destructive">This cannot be undone.</p>
  </div>
</template>
