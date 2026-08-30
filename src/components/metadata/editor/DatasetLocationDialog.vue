<script setup lang="ts">
// Where a dataset is stored: the group, the folder inside it and who may see
// it. The group and the path are fixed once the dataset exists.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { FolderPlus, Globe, Plus, Users } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import GroupSelect from '@/components/groups/GroupSelect.vue'
import LocationFolderTree from './LocationFolderTree.vue'
import { useAruna } from '@/composables/useAruna'
import { joinPath } from '@/lib/crate/paths'
import { slugify } from '@/lib/profiles/emit'
import type { CrateDraft } from '@/lib/crate/editor'

const props = defineProps<{
  open: boolean
  draft: CrateDraft
  mode: 'create' | 'edit'
  groupOptions: Array<{ value: string; label: string }>
  /** The folder inside the group and the last part of the path, kept apart by the host. */
  folder: string
  slug: string
  /** The group's stored dataset paths and the caller's writable folders. */
  documentPaths: string[]
  grants: string[]
  loading?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'update', draft: CrateDraft): void
  (e: 'folder', folder: string): void
  (e: 'slug', slug: string): void
  (e: 'create-group'): void
}>()

const VISIBILITY = [
  { value: 'group', label: 'Group', hint: 'Members of the group, as its policies allow.', icon: Users },
  { value: 'public', label: 'Public', hint: 'Visible to anyone without signing in.', icon: Globe },
] as const

const { realm } = useAruna()

const pending = ref<string[]>([])
const folderName = ref('')

watch(() => props.draft.groupId, () => {
  pending.value = []
  folderName.value = ''
})

function createFolder() {
  const name = slugify(folderName.value)
  if (!name) return
  const folder = joinPath(props.folder, name)
  if (!pending.value.includes(folder)) pending.value = [...pending.value, folder]
  emit('folder', folder)
  folderName.value = ''
}

const fullPath = computed(() => {
  const group = props.draft.groupId || '…'
  return `/${realm.value.id}/g/${group}/meta/${joinPath(props.folder, props.slug || '…')}`
})
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Where this dataset lives</DialogTitle>
        <DialogDescription>
          Pick the group, a folder inside it and who may see it. Folders organise datasets; nothing is
          stored until the dataset is created.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5">
        <section>
          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Group</p>
          <GroupSelect
            :model-value="draft.groupId"
            :options="groupOptions"
            placeholder="Choose a group"
            aria-label="Group"
            :disabled="mode === 'edit'"
            @update:model-value="(value: string) => emit('update', { ...draft, groupId: value })"
          >
            <template #action>
              <Button variant="link" size="sm" class="h-auto p-0 text-xs" @click="emit('create-group')">
                <Plus class="h-3.5 w-3.5" /> Create a group
              </Button>
            </template>
          </GroupSelect>
        </section>

        <template v-if="mode === 'create'">
          <section>
            <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Folder</p>
            <p v-if="!draft.groupId" class="text-xs text-muted-foreground">Choose a group first.</p>
            <template v-else>
              <div class="rounded-md border border-border bg-muted/20 px-1.5">
                <LocationFolderTree
                  :model-value="folder"
                  :document-paths="documentPaths"
                  :grants="grants"
                  :pending="pending"
                  :loading="loading"
                  @update:model-value="(value) => emit('folder', value)"
                />
              </div>
              <div class="mt-2 flex items-center gap-1.5">
                <Input
                  :model-value="folderName"
                  class="h-8 max-w-[16rem] font-mono text-xs"
                  aria-label="New folder name"
                  placeholder="new-folder"
                  @update:model-value="(value: string | number) => (folderName = String(value))"
                />
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="!slugify(folderName)"
                  @click="createFolder"
                >
                  <FolderPlus class="h-3.5 w-3.5" /> Create folder
                </Button>
              </div>
            </template>
          </section>

          <section>
            <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Last part of the path
            </p>
            <Input
              :model-value="slug"
              class="font-mono text-xs"
              aria-label="Dataset path"
              placeholder="dataset-name"
              @update:model-value="(value: string | number) => emit('slug', slugify(String(value)))"
            />
            <p class="mt-1 text-[11px] text-muted-foreground">Follows the dataset name until you change it.</p>
          </section>
        </template>

        <section v-else>
          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Path</p>
          <p
            class="flex h-9 items-center truncate rounded-md border border-dashed border-border px-3 font-mono text-xs text-foreground"
            :title="draft.path"
          >
            {{ draft.path || 'No path yet' }}
          </p>
        </section>

        <section>
          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Visibility</p>
          <div role="radiogroup" aria-label="Visibility" class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in VISIBILITY"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="draft.visibility === option.value"
              class="rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
              :class="draft.visibility === option.value
                ? 'border-primary bg-primary/5'
                : 'border-border'"
              @click="emit('update', { ...draft, visibility: option.value })"
            >
              <span class="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <component :is="option.icon" class="h-3.5 w-3.5 text-primary/70" />
                {{ option.label }}
              </span>
              <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ option.hint }}</span>
            </button>
          </div>
          <p v-if="draft.groupId" class="mt-1 text-[11px] text-muted-foreground">
            <RouterLink
              :to="{ name: 'group', params: { id: draft.groupId }, hash: '#policies' }"
              class="font-medium text-primary hover:underline"
            >Group policies</RouterLink>
          </p>
        </section>
      </div>

      <DialogFooter class="items-center sm:justify-between">
        <p class="truncate font-mono text-[11px] text-muted-foreground" :title="fullPath">{{ fullPath }}</p>
        <Button size="sm" @click="emit('update:open', false)">Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
