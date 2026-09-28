<script setup lang="ts">
// Where this dataset is published: one block per push link with a published record.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import type { RepositoryLink } from '@/lib/api'
import { endpointLabel, failureText, identifierName, identifierUrl } from '@/lib/repository'
import { relativeTime } from '@/lib/utils'

const props = defineProps<{ links: RepositoryLink[] }>()
const emit = defineEmits<{ (e: 'manage'): void }>()
const open = defineModel<boolean>('open', { required: true })

const title = computed(() => {
  const names = new Set(props.links.map((link) => endpointLabel(link.endpoint)))
  return names.size === 1 ? `Published to ${[...names][0]}` : 'Published to repositories'
})
const summary = computed(() => {
  const count = props.links.length
  return `This dataset has a published record in ${count} ${count === 1 ? 'repository' : 'repositories'}.`
})

function host(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ summary }}</DialogDescription>
      </DialogHeader>
      <div class="max-h-[60vh] space-y-4 overflow-y-auto">
        <dl
          v-for="link in links"
          :key="link.link_id"
          class="grid gap-x-4 gap-y-2 border-t border-border pt-4 text-sm first:border-t-0 first:pt-0 sm:grid-cols-[8rem_1fr]"
        >
          <dt class="text-muted-foreground">Repository</dt>
          <dd class="min-w-0 break-all">{{ host(link.endpoint) }}</dd>
          <template v-if="link.remote.identifier">
            <dt class="text-muted-foreground">{{ identifierName(link.identifier_kind, true) }}</dt>
            <dd class="flex min-w-0 items-center gap-1 font-mono text-xs">
              <ExternalLink :href="identifierUrl(link.identifier_kind, link.remote.identifier)" :label="link.remote.identifier" />
              <CopyButton :value="link.remote.identifier" :label="`Copy ${identifierName(link.identifier_kind)}`" />
            </dd>
          </template>
          <template v-if="link.remote.concept_identifier">
            <dt class="text-muted-foreground">All versions</dt>
            <dd class="flex min-w-0 items-center gap-1 font-mono text-xs">
              <ExternalLink :href="identifierUrl(link.identifier_kind, link.remote.concept_identifier)" :label="link.remote.concept_identifier" />
              <CopyButton :value="link.remote.concept_identifier" :label="`Copy concept ${identifierName(link.identifier_kind)}`" />
            </dd>
          </template>
          <template v-if="link.remote.record_url">
            <dt class="text-muted-foreground">Record</dt>
            <dd><ExternalLink :href="link.remote.record_url" label="Open in the repository" /></dd>
          </template>
          <dt class="text-muted-foreground">Last push</dt>
          <dd>
            {{ link.last_push ? `${relativeTime(link.last_push.pushed_at)}, succeeded` : 'None yet' }}
            <span v-if="link.status === 'failed'" class="block text-xs text-destructive">{{ failureText(link.reason) }}</span>
          </dd>
          <dt class="text-muted-foreground">Updates</dt>
          <dd>{{ link.auto_publish ? 'Published automatically on change' : 'Changes stay a draft until someone publishes them' }}</dd>
        </dl>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="emit('manage')">Manage in Repositories</Button>
        <DialogClose as-child><Button>Close</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
