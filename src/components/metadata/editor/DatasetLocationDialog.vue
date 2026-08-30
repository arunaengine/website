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
import Notice from '@/components/ui/Notice.vue'
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
  /** Whether the group already stores a dataset at this path, and the lookup. */
  taken?: boolean
  checking?: boolean
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
const customising = ref(false)

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

// The path a person reads; the last part waits for the dataset name.
const previewPath = computed(() => (props.mode === 'edit'
  ? props.draft.path || 'No path yet'
  : joinPath(props.folder, props.slug || '…')))

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

      <div class="min-w-0 space-y-5">
        <section class="min-w-0">
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

        <section v-if="mode === 'create'" class="min-w-0">
          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Folder</p>
          <p v-if="!draft.groupId" class="text-xs text-muted-foreground">Choose a group first.</p>
          <template v-else>
            <div class="min-w-0 rounded-md border border-border bg-muted/20 px-1.5">
              <LocationFolderTree
                :model-value="folder"
                :document-paths="documentPaths"
                :grants="grants"
                :pending="pending"
                :loading="loading"
                @update:model-value="(value) => emit('folder', value)"
              />
            </div>
            <div class="mt-2 flex min-w-0 items-center gap-1.5">
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

        <section class="min-w-0">
          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Path</p>
          <p
            class="break-all rounded-md border border-dashed border-border px-3 py-2 font-mono text-xs text-foreground"
            :title="previewPath"
            :aria-busy="checking"
          >
            {{ previewPath }}
          </p>
          <Notice v-if="taken" tone="error" class="mt-1.5">
            A dataset already uses this path in this group. Choose another folder or name.
          </Notice>
          <template v-if="mode === 'create'">
            <Button
              v-if="!customising"
              variant="link"
              size="sm"
              class="mt-1 h-auto p-0 text-xs"
              @click="customising = true"
            >
              Customise the last part
            </Button>
            <div v-else class="mt-2 min-w-0">
              <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Name in the path
              </p>
              <Input
                :model-value="slug"
                class="font-mono text-xs"
                aria-label="Name in the path"
                placeholder="dataset-name"
                @update:model-value="(value: string | number) => emit('slug', slugify(String(value)))"
              />
              <p class="mt-1 text-[11px] text-muted-foreground">
                Derived from the dataset name. Letters, numbers and dashes.
              </p>
            </div>
          </template>
        </section>

        <section class="min-w-0">
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

      <DialogFooter class="min-w-0 items-center sm:justify-between">
        <p class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" :title="fullPath">
          {{ fullPath }}
        </p>
        <Button size="sm" class="shrink-0" @click="emit('update:open', false)">Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
