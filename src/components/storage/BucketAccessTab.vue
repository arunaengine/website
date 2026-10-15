<script setup lang="ts">
// Who besides the group may read this bucket: everyone's read rules inside it,
// from the group's "public" role, and the whole bucket in one step.
import { computed, ref } from 'vue'
import PublicAccessDialog from '@/components/data/PublicAccessDialog.vue'
import Button from '@/components/ui/Button.vue'
import DocsLink from '@/components/ui/DocsLink.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { usePublicAccess } from '@/composables/usePublicAccess'
import { rulesInBucket, targetLabel, type PublicRule, type PublicTarget } from '@/lib/publicAccess'
import { errorMessage } from '@/lib/utils'
import { Globe } from '@lucide/vue'

const props = defineProps<{ bucket: string; groupId: string | null; nodeId: string | null }>()

const access = usePublicAccess(computed(() => props.groupId))
const publicRules = computed(() => rulesInBucket(access.role.value, access.root(props.nodeId), props.bucket))
const bucketTarget = computed<PublicTarget>(() => ({ kind: 'bucket', bucket: props.bucket, key: '' }))
const publicOpen = ref(false)
const removingRule = ref<string | null>(null)
const removeError = ref<string | null>(null)

async function removeRule(entry: PublicRule) {
  removingRule.value = entry.rule
  removeError.value = null
  try {
    await access.revoke(props.nodeId, [entry.target])
  } catch (err) {
    removeError.value = errorMessage(err)
  } finally {
    removingRule.value = null
  }
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <Globe class="size-4 text-primary" />
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Public access</h2>
      <DocsLink icon topic="data-and-deletion" section="Public access" />
      <Button
        v-if="access.canManage.value"
        variant="outline"
        size="sm"
        class="ml-auto"
        @click="publicOpen = true"
      >
        <Globe class="h-3.5 w-3.5" /> Whole bucket
      </Button>
    </header>
    <div class="px-5 py-4 text-sm">
      <Skeleton v-if="access.loading.value" class="h-4 w-48" />
      <p v-else-if="access.error.value" class="text-muted-foreground">
        The group's roles could not be loaded: {{ access.error.value }}
      </p>
      <p v-else-if="!publicRules.length" class="text-muted-foreground">
        Nothing in this bucket is public. Everyone, including visitors who are not signed in, could read
        what a public rule covers.
      </p>
      <ul v-else class="divide-y divide-border/60 rounded-md border border-border/60 text-xs">
        <li v-for="entry in publicRules" :key="entry.rule" class="flex items-center justify-between gap-3 px-3 py-2">
          <span class="min-w-0 break-all">Everyone can read {{ targetLabel(entry.target) }}</span>
          <Button
            v-if="access.canManage.value"
            variant="ghost"
            size="sm"
            class="shrink-0"
            :disabled="removingRule !== null"
            @click="removeRule(entry)"
          >
            {{ removingRule === entry.rule ? 'Removing…' : 'Remove' }}
          </Button>
        </li>
      </ul>
      <p v-if="removeError" class="mt-2 text-xs text-destructive">{{ removeError }}</p>
    </div>
    <PublicAccessDialog
      v-model:open="publicOpen"
      :access="access"
      :node-id="nodeId"
      :targets="[bucketTarget]"
    />
  </section>
</template>
