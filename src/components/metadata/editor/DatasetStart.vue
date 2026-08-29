<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import PathField from './PathField.vue'
import { entityName, rootEntity, rootId, setProperty, type CrateDraft } from '@/lib/crate/editor'
import type { PathPrefixOption } from '@/lib/crate/paths'
import { ArrowRight, FileJson2, Plus } from '@lucide/vue'

// The first screen of a new dataset: the group it belongs to, what it is
// called and where it goes. Everything else waits for the editor.
const props = defineProps<{
  draft: CrateDraft
  groupOptions: Array<{ value: string; label: string }>
  pathOptions: PathPrefixOption[]
  pathLoading?: boolean
}>()
const emit = defineEmits<{
  (e: 'update', draft: CrateDraft): void
  (e: 'path', path: string): void
  (e: 'create-group'): void
  (e: 'import'): void
  (e: 'continue'): void
}>()

const name = computed(() => entityName(rootEntity(props.draft)))
const description = computed(() => rootEntity(props.draft)?.properties.description?.[0]?.value ?? '')
const ready = computed(() => Boolean(name.value && props.draft.groupId && props.draft.path))

function setText(property: string, value: string, kind: 'text' | 'longtext' = 'text') {
  emit('update', setProperty(props.draft, rootId(props.draft), property, value.trim() ? [{ kind, value }] : []))
}
</script>

<template>
  <div class="container py-8">
    <section class="surface mx-auto max-w-2xl">
      <header class="border-b border-border px-6 py-4">
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Start a dataset</h2>
        <p class="text-xs text-muted-foreground">Pick the group, name the dataset and choose where it is stored.</p>
      </header>

      <div class="space-y-5 px-6 py-5">
        <div>
          <span class="text-xs font-medium text-foreground">Group</span>
          <GroupSelect
            :model-value="draft.groupId"
            :options="groupOptions"
            class="mt-1"
            placeholder="Choose a group"
            aria-label="Group"
            @update:model-value="(value) => emit('update', { ...draft, groupId: value })"
          >
            <template #action>
              <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="emit('create-group')">
                <Plus class="h-3.5 w-3.5" /> Create a group
              </Button>
            </template>
          </GroupSelect>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground" for="start-name">Name</label>
          <Input
            id="start-name"
            :model-value="name"
            class="mt-1"
            aria-label="Dataset name"
            placeholder="What this dataset is called"
            @update:model-value="(value: string | number) => setText('name', String(value))"
          />
        </div>

        <div>
          <label class="text-xs font-medium text-foreground" for="start-description">Description</label>
          <Textarea
            id="start-description"
            :model-value="description"
            rows="3"
            class="mt-1 font-sans"
            aria-label="Dataset description"
            placeholder="What it contains and how it was made"
            @update:model-value="(value: string) => setText('description', value, 'longtext')"
          />
        </div>

        <div>
          <span class="text-xs font-medium text-foreground">Path</span>
          <PathField
            :model-value="draft.path ?? ''"
            :options="pathOptions"
            :loading="pathLoading"
            class="mt-1"
            @update:model-value="(value) => emit('path', value)"
          />
          <p class="mt-1 text-[11px] text-muted-foreground">
            The prefix comes from what you may write in this group; the last part follows the name until you change it.
          </p>
        </div>
      </div>

      <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4">
        <Button variant="outline" size="sm" @click="emit('import')">
          <FileJson2 class="h-3.5 w-3.5" /> Import an RO-Crate instead
        </Button>
        <Button size="sm" :disabled="!ready" @click="emit('continue')">
          Continue <ArrowRight class="h-3.5 w-3.5" />
        </Button>
      </footer>
    </section>
  </div>
</template>
