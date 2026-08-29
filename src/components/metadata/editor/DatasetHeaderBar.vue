<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import VisibilitySelect from '@/components/metadata/VisibilitySelect.vue'
import PathField from './PathField.vue'
import type { CrateDraft } from '@/lib/crate/editor'
import type { PathPrefixOption } from '@/lib/crate/paths'
import { Plus } from '@lucide/vue'

// One aligned row under the page header: where the dataset lives and who
// sees it. The group and path are fixed once the dataset exists.
defineProps<{
  draft: CrateDraft
  mode: 'create' | 'edit'
  groupOptions: Array<{ value: string; label: string }>
  pathOptions: PathPrefixOption[]
  pathLoading?: boolean
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'path', path: string): void
  (e: 'create-group'): void
}>()
</script>

<template>
  <div class="border-b border-border bg-muted/20">
    <div class="container grid gap-4 py-3 md:grid-cols-[14rem_minmax(0,1fr)_9rem]">
      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Group</p>
        <GroupSelect
          :model-value="draft.groupId"
          :options="groupOptions"
          class="h-9 text-xs"
          placeholder="Choose a group"
          aria-label="Group"
          :disabled="mode === 'edit'"
          @update:model-value="(value) => emit('update', { ...draft, groupId: value })"
        >
          <template #action>
            <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="emit('create-group')">
              <Plus class="h-3.5 w-3.5" /> Create a group
            </Button>
          </template>
        </GroupSelect>
      </div>
      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Path</p>
        <PathField
          :model-value="draft.path ?? ''"
          :options="pathOptions"
          :loading="pathLoading"
          :readonly="mode === 'edit'"
          @update:model-value="(value) => emit('path', value)"
        />
      </div>
      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visibility</p>
        <VisibilitySelect
          compact
          class="h-9 w-full text-xs"
          :model-value="draft.visibility"
          :group-id="draft.groupId"
          @update:model-value="(value) => emit('update', { ...draft, visibility: value })"
        />
      </div>
    </div>
  </div>
</template>
