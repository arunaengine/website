<script setup lang="ts">
// Grants or removes everyone's read access for files, folders or a bucket by
// editing the group's "public" role; the change lands as one role replacement.
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Globe, Lock } from '@lucide/vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { endpointForNode } from '@/composables/s3/endpoints'
import type { PublicAccess } from '@/composables/usePublicAccess'
import { publicUrl, targetLabel, type PublicTarget } from '@/lib/publicAccess'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{
  open: boolean
  access: PublicAccess
  nodeId: string | null
  targets: readonly PublicTarget[]
  /** Opened from another dialog, so it must sit above that one. */
  raised?: boolean
}>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'changed'): void }>()

const busy = ref(false)
const submitError = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) submitError.value = null
  },
)

const rows = computed(() =>
  props.targets.map((target) => {
    const path = props.access.pathOf(props.nodeId, target)
    const rules = props.access.rulesFor(props.nodeId, target)
    // A rule on a parent keeps the target public after its own rule is gone.
    const inherited = rules.filter((rule) => rule !== path)
    const endpoint = rules.length ? endpointForNode(props.nodeId) : null
    return {
      target,
      label: targetLabel(target),
      isPublic: rules.length > 0,
      inherited,
      url: endpoint ? publicUrl(endpoint, target) : null,
    }
  }),
)

const anyPrivate = computed(() => rows.value.some((row) => !row.isPublic))
const anyPublic = computed(() => rows.value.some((row) => row.isPublic))
const rolesLink = computed(() => {
  const groupId = props.access.detail.value?.group_id
  return groupId ? { name: 'group', params: { id: groupId }, query: { tab: 'roles' } } : null
})
const blocked = computed(() =>
  props.access.loading.value
    ? null
    : props.access.error.value
      ? `The group's roles could not be loaded: ${props.access.error.value}`
      : !props.access.canManage.value
        ? 'Only group admins can change public access.'
        : null,
)

function ruleName(rule: string): string {
  const inside = rule.slice(props.access.root(props.nodeId).length + 1)
  return inside.endsWith('/**') ? `${inside.slice(0, -3)}/` : inside
}

async function apply(action: 'grant' | 'revoke') {
  if (busy.value || blocked.value) return
  busy.value = true
  submitError.value = null
  try {
    if (action === 'grant') await props.access.grant(props.nodeId, props.targets)
    else await props.access.revoke(props.nodeId, props.targets)
    emit('changed')
    emit('update:open', false)
  } catch (err) {
    submitError.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogContent class="max-w-lg" :class="raised ? 'z-[var(--z-assistant-modal)]' : undefined">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Globe class="h-4 w-4 text-primary" /> Public access
        </DialogTitle>
        <DialogDescription>
          Everyone, signed in or not, can read what is public. Managed through the group role
          <RouterLink v-if="rolesLink && access.role.value" :to="rolesLink" class="font-medium text-primary hover:underline">public</RouterLink>
          <template v-else><span class="font-medium text-foreground">public</span>, created when needed</template>.
          <DocsLink icon topic="data-and-deletion" section="Public access" class="ml-0.5" />
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <ul class="divide-y divide-border/60 rounded-md border border-border/60 text-xs">
          <li v-for="row in rows" :key="row.label" class="space-y-1 px-3 py-2">
            <div class="flex items-center justify-between gap-3">
              <span class="min-w-0 break-all">{{ row.label }}</span>
              <Badge :variant="row.isPublic ? 'success' : 'secondary'" size="sm" class="shrink-0 uppercase">
                <Globe v-if="row.isPublic" class="mr-0.5 size-3" aria-hidden="true" />
                <Lock v-else class="mr-0.5 size-3" aria-hidden="true" />
                {{ row.isPublic ? 'public' : 'private' }}
              </Badge>
            </div>
            <p v-if="row.inherited.length" class="text-[11px] text-muted-foreground">
              Through the rule on {{ ruleName(row.inherited[0]) }}
            </p>
            <p v-if="row.url" class="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span class="min-w-0 truncate font-mono" :title="row.url">{{ row.url }}</span>
              <CopyButton :value="row.url" label="Copy the public address" />
            </p>
          </li>
        </ul>
        <Spinner v-if="access.loading.value" show-label label="Loading the group's roles…" />
        <Notice v-else-if="blocked" tone="warning">{{ blocked }}</Notice>
        <Notice v-if="submitError" tone="error">{{ submitError }}</Notice>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline" :disabled="busy">Cancel</Button></DialogClose>
        <Button
          variant="outline"
          :disabled="busy || Boolean(blocked) || !anyPublic"
          @click="apply('revoke')"
        >
          Remove public access
        </Button>
        <Button :disabled="busy || Boolean(blocked) || !anyPrivate" @click="apply('grant')">
          <Spinner v-if="busy" label="Saving…" />
          <Globe v-else class="h-4 w-4" /> Make public
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
