<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Badge from '@/components/ui/Badge.vue'
import CreateGroupDialog from '@/components/groups/CreateGroupDialog.vue'
import { computed, ref, watch } from 'vue'
import { FileJson2, Plus } from 'lucide-vue-next'
import { useAruna } from '@/composables/useAruna'
import type { MetadataDoc } from '@/data/types'

const props = defineProps<{
  open: boolean
  defaultProfileId?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', doc: MetadataDoc): void
}>()

const { groups, profiles, metadata, createMetadata, saving, currentUser } = useAruna()

const groupId = ref('')
const profileId = ref('')
const path = ref('')
const title = ref('')
const description = ref('')
const datePublished = ref(new Date().toISOString().slice(0, 10))
const license = ref('https://creativecommons.org/licenses/by/4.0/')
const isPublic = ref(false)
const submitError = ref<string | null>(null)
const createGroupOpen = ref(false)

const groupOptions = computed(() => groups.value.map((group) => ({ value: group.id, label: group.name })))
const profileOptions = computed(() => [
  { value: '', label: 'No profile reference' },
  ...profiles.value.map((profile) => ({ value: profile.id, label: profile.name })),
])
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === profileId.value))
const canSubmit = computed(() => Boolean(groupId.value && path.value.trim() && title.value.trim()))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    groupId.value = groups.value[0]?.id ?? ''
    profileId.value = props.defaultProfileId ?? currentUser.value?.preferredProfileId ?? ''
    path.value = ''
    title.value = ''
    description.value = ''
    datePublished.value = new Date().toISOString().slice(0, 10)
    license.value = 'https://creativecommons.org/licenses/by/4.0/'
    isPublic.value = false
    submitError.value = null
  },
  { immediate: true },
)

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-|-$/g, '')
}

function fillPath() {
  if (!title.value.trim() || path.value.trim()) return
  path.value = `datasets/${slugify(title.value)}`
}

function buildRoCrate() {
  const entityId = `aruna:dataset/${slugify(path.value)}`
  const dataset: Record<string, unknown> = {
    '@id': entityId,
    '@type': 'Dataset',
    name: title.value.trim(),
    description: description.value.trim(),
    datePublished: datePublished.value,
    license: { '@id': license.value.trim() },
  }
  if (profileId.value) {
    dataset.conformsTo = { '@id': `aruna:profile/${profileId.value}` }
  }
  return {
    '@context': [
      'https://w3id.org/ro/crate/1.2/context',
      { aruna: 'https://w3id.org/aruna/ns#' },
    ],
    '@graph': [
      {
        '@id': 'ro-crate-metadata.json',
        '@type': 'CreativeWork',
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.2' },
        about: { '@id': entityId },
      },
      dataset,
    ],
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitError.value = null
  try {
    const created = await createMetadata({
      group_id: groupId.value,
      path: path.value.trim(),
      public: isPublic.value,
      rocrate: buildRoCrate(),
    })
    const doc = metadata.value.find((item) => item.ulid === created.document_id) ?? {
      ulid: created.document_id,
      title: title.value.trim(),
      description: description.value.trim(),
      type: 'Dataset',
      license: license.value,
      keywords: [],
      currentVersion: 1,
      versions: [],
      linkedObjects: [],
      primaryBucketId: '',
      realmId: created.group_id,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      author: currentUser.value?.name ?? '',
      organization: currentUser.value?.affiliation ?? '',
      nodeId: '',
      profileId: profileId.value,
      contributors: [],
      roCrate: buildRoCrate(),
    }
    emit('created', doc)
    emit('update:open', false)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <FileJson2 class="h-4 w-4 text-primary" /> New metadata document
        </DialogTitle>
        <DialogDescription>
          Creates a real RO-Crate metadata document through the Aruna API.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div v-if="!currentUser" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Sign in before creating metadata.
        </div>
        <div v-else-if="!groups.length" class="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span>You are not a member of any group yet — datasets belong to a group.</span>
          <Button variant="outline" size="sm" class="shrink-0" @click="createGroupOpen = true">
            <Plus class="h-3.5 w-3.5" /> Create a group
          </Button>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Group</label>
            <Select v-model="groupId" :options="groupOptions" placeholder="Choose a group" class="mt-1" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">Profile reference</label>
            <Select v-model="profileId" :options="profileOptions" placeholder="Optional profile" class="mt-1" />
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-foreground">Title</label>
          <Input v-model="title" class="mt-1" placeholder="Dataset title" @blur="fillPath" />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Document path</label>
          <Input v-model="path" class="mt-1" placeholder="datasets/my-dataset" />
          <p class="mt-1 text-[11px] text-muted-foreground">Stored as the metadata document path in Aruna.</p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Description</label>
          <Textarea v-model="description" class="mt-1" rows="3" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-foreground">Date published</label>
            <Input v-model="datePublished" type="date" class="mt-1" />
          </div>
          <div>
            <label class="text-xs font-medium text-foreground">License URL</label>
            <Input v-model="license" class="mt-1" />
          </div>
        </div>
        <label class="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>
            Public metadata
            <span class="block text-[11px] text-muted-foreground">Public documents are visible without a bearer token.</span>
          </span>
          <Switch :checked="isPublic" @update:checked="(v: boolean) => (isPublic = v)" />
        </label>
        <div v-if="selectedProfile" class="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground/85">
          <Badge variant="secondary" class="mr-1 text-[10px]">profile</Badge>
          The RO-Crate will reference {{ selectedProfile.name }} using `conformsTo`.
        </div>
        <div v-if="submitError" class="text-xs text-destructive">{{ submitError }}</div>
      </div>

      <DialogFooter>
        <DialogClose><Button variant="outline">Cancel</Button></DialogClose>
        <Button :disabled="!canSubmit || saving || !currentUser" @click="submit">
          {{ saving ? 'Creating…' : 'Create metadata' }}
        </Button>
      </DialogFooter>

      <CreateGroupDialog v-model:open="createGroupOpen" @created="(group) => (groupId = group.group_id)" />
    </DialogContent>
  </Dialog>
</template>
