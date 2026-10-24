<script setup lang="ts">
// One database mark that waits for the group that owns the bucket. The admins of that group agree
// or decline; the user who asked can withdraw it.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useAruna } from '@/composables/useAruna'
import { useDatabaseRequests } from '@/composables/useDatabaseRequests'
import { useDatasetBrief } from '@/composables/useDatasetBrief'
import type { DatabaseRequestView } from '@/lib/api'
import { shortUserId } from '@/lib/utils'

const props = defineProps<{ request: DatabaseRequestView }>()

const { currentUser, apiGroups } = useAruna()
const requests = useDatabaseRequests()
const brief = useDatasetBrief(computed(() => props.request.entry.dataset_id))

const mine = computed(() => props.request.curator === currentUser.value?.id)
const group = computed(() => apiGroups.value.find((item) => item.group_id === props.request.entry.owner_group)?.display_name)
const bucket = computed(() => {
  const target = props.request.entry.target
  return target.kind === 'ordinary' ? target.bucket : 'A bucket stored on more nodes'
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground">
        {{ brief?.name || 'Dataset' }}
        <span class="font-mono text-xs font-normal text-muted-foreground">{{ bucket }}</span>
      </p>
      <p class="text-xs text-muted-foreground">
        Asked by {{ mine ? 'you' : shortUserId(request.curator) }}. Waiting for the group admins of
        {{ group ?? 'the owning group' }}.
      </p>
    </div>
    <template v-if="mine">
      <Button size="sm" variant="ghost" @click="requests.drop(request.request_id)">Withdraw</Button>
    </template>
    <template v-else>
      <Button size="sm" @click="requests.approve(request.request_id)">Agree</Button>
      <Button size="sm" variant="outline" @click="requests.drop(request.request_id)">Decline</Button>
    </template>
  </div>
</template>
