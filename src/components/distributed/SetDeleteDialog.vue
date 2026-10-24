<script setup lang="ts">
// Deleting a bucket stored on several nodes. The preview lists datasets that refer to it and says if the list is complete.
import { computed, ref } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import { DELETE_PREVIEWS } from '@/lib/distributedMockData'
import { degradedRanges, type DistributedBucket } from '@/lib/distribution'

const props = defineProps<{ open: boolean; bucket: DistributedBucket }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'done', message: string): void }>()

const typed = ref('')
const understood = ref(false)

const preview = computed(() => DELETE_PREVIEWS[props.bucket.name] ?? { datasets: [], reasons: [] })
const complete = computed(() => preview.value.reasons.length === 0)
const unreachable = computed(() => [...new Set(degradedRanges(props.bucket).map((range) => range.coordinator))])
const ready = computed(() => typed.value === props.bucket.name && (complete.value || understood.value))

function remove() {
  emit('done', `${props.bucket.name} would be fenced on every coordinator, then deleted node by node.`)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete {{ bucket.name }}</DialogTitle>
        <DialogDescription>
          Every coordinator stops writes first. Then every node deletes its own bucket in pages.
          A node that is offline does this when it returns.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-foreground">Datasets that refer to this bucket</h3>
          <Badge :variant="complete ? 'success' : 'warn'" size="sm">{{ complete ? 'Complete' : 'Incomplete' }}</Badge>
        </div>
        <ul v-if="preview.datasets.length" class="divide-y divide-border rounded-md border border-border text-xs">
          <li v-for="dataset in preview.datasets" :key="dataset.title" class="flex flex-wrap justify-between gap-2 px-3 py-2">
            <span class="font-medium text-foreground">{{ dataset.title }} <span class="font-normal text-muted-foreground">in {{ dataset.group }}</span></span>
            <span class="text-muted-foreground">{{ dataset.refers }}</span>
          </li>
        </ul>
        <p v-else class="text-xs text-muted-foreground">No dataset refers to this bucket.</p>
        <Notice v-if="!complete" tone="warning" title="The list may miss datasets" :lines="preview.reasons" />
        <p class="text-xs text-muted-foreground">Datasets keep their entries. The files they point to are gone.</p>
      </div>

      <Notice v-if="unreachable.length" tone="warning">
        {{ unreachable.join(', ') }} is unreachable. The last step waits until it is back.
      </Notice>

      <label v-if="!complete" class="flex items-start gap-2 text-xs">
        <input v-model="understood" type="checkbox" class="mt-0.5" />
        <span>I understand that the list above may be incomplete.</span>
      </label>
      <div class="space-y-1">
        <label class="text-xs font-medium text-foreground" for="dm-delete-name">Type the bucket name to confirm</label>
        <Input id="dm-delete-name" v-model="typed" class="font-mono text-xs" :placeholder="bucket.name" />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button variant="destructive" :disabled="!ready" @click="remove">Delete bucket</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
