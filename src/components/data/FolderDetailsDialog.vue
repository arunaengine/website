<script setup lang="ts">
// The folder counterpart of the file details: where the folder lives and
// whether everyone may read it, with the public access dialog behind a button.
import { computed, ref } from 'vue'
import { Folder, Globe, Lock } from '@lucide/vue'
import PublicAccessDialog from '@/components/data/PublicAccessDialog.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import { useRealmNodes } from '@/composables/useRealmNodes'
import type { PublicAccess } from '@/composables/usePublicAccess'
import type { PublicTarget } from '@/lib/publicAccess'

const props = defineProps<{
  open: boolean
  bucket: string
  /** Folder prefix with its trailing slash. */
  prefix: string
  name: string
  nodeId: string | null
  access: PublicAccess
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const { displayName } = useRealmNodes()
const target = computed<PublicTarget>(() => ({ kind: 'folder', bucket: props.bucket, key: props.prefix }))
const folderPublic = computed(() => props.access.isPublic(props.nodeId, target.value))
const publicOpen = ref(false)

const details = computed(() => [
  { label: 'Bucket', value: props.bucket },
  { label: 'Folder', value: props.prefix },
  { label: 'Node', value: displayName(props.nodeId) },
  { label: 'Group', value: props.access.groupName.value ?? 'unknown' },
])
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Folder class="h-4 w-4 text-primary" /> {{ name || prefix }}
        </DialogTitle>
        <DialogDescription class="font-mono text-[11px]">{{ bucket }}/{{ prefix }}</DialogDescription>
      </DialogHeader>

      <dl class="space-y-2 text-xs">
        <div v-for="detail in details" :key="detail.label" class="flex items-baseline justify-between gap-4">
          <dt class="shrink-0 text-muted-foreground">{{ detail.label }}</dt>
          <dd class="min-w-0 break-all text-right font-mono text-foreground">{{ detail.value }}</dd>
        </div>
        <div class="flex items-center justify-between gap-4">
          <dt class="shrink-0 text-muted-foreground">Public access</dt>
          <dd class="flex min-w-0 items-center justify-end gap-2">
            <Badge :variant="folderPublic ? 'success' : 'secondary'" size="sm" class="uppercase">
              <Globe v-if="folderPublic" class="mr-0.5 size-3" aria-hidden="true" />
              <Lock v-else class="mr-0.5 size-3" aria-hidden="true" />
              {{ folderPublic ? 'public' : 'private' }}
            </Badge>
            <Button variant="outline" size="sm" @click="publicOpen = true">
              <Globe class="h-3.5 w-3.5" /> {{ folderPublic ? 'Public access…' : 'Make public…' }}
            </Button>
          </dd>
        </div>
      </dl>
      <p class="text-xs text-muted-foreground">
        A public folder rule covers every file below it, including files added later.
      </p>
    </DialogContent>
  </Dialog>
  <PublicAccessDialog v-model:open="publicOpen" :access="access" :node-id="nodeId" :targets="[target]" />
</template>
