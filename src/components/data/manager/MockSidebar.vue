<script setup lang="ts">
// The bucket list when no session can open: only the example buckets, from static data.
import { computed, ref } from 'vue'
import BucketCreateResults from '@/components/data/BucketCreateResults.vue'
import BucketStorageDialog from '@/components/data/BucketStorageDialog.vue'
import MockBucketRows from '@/components/data/manager/MockBucketRows.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import OptionToggle from '@/components/ui/OptionToggle.vue'
import { bucketNameProblem } from '@/lib/bucketName'
import { defaultPlacement, placementLabel } from '@/lib/distributedMock'
import { exampleBuckets } from '@/lib/distributedMockData'
import { FolderPlus } from '@lucide/vue'

defineProps<{ active: string }>()
const emit = defineEmits<{ (e: 'open', bucket: string): void }>()

const filter = ref('')
const kind = ref('buckets')
const KINDS = [
  { value: 'buckets', label: 'Buckets' },
  { value: 'database', label: 'Databases' },
]
const name = ref('')
const placement = ref(defaultPlacement())
const storageOpen = ref(false)
const resultsOpen = ref(false)
const done = ref('')

const problem = computed(() => (name.value.trim() ? bucketNameProblem(name.value.trim()) : null))

function create() {
  if (!name.value.trim() || problem.value) return
  if (placement.value.several) resultsOpen.value = true
  else done.value = `Mock, nothing changed: ${name.value.trim()} would be created on this node.`
}
</script>

<template>
  <aside class="space-y-3">
    <div class="surface overflow-hidden">
      <header class="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 class="text-sm font-semibold text-foreground">Buckets</h2>
        <Badge variant="outline" size="count">{{ exampleBuckets(filter).length }}</Badge>
      </header>
      <div class="border-b border-border px-3 py-2">
        <OptionToggle v-model="kind" :options="KINDS" aria-label="Kind of bucket" />
      </div>
      <div class="border-b border-border px-3 py-2">
        <Input v-model="filter" placeholder="Find a bucket" aria-label="Find a bucket" class="h-8 text-xs" />
    </div>
    <ul class="max-h-[420px] overflow-y-auto py-1">
      <MockBucketRows :database-only="kind === 'database'" :filter="filter" :active="active" @open="emit('open', $event)" />
    </ul>
    <footer class="space-y-2 border-t border-border p-3">
      <div class="flex gap-2">
        <Input
          v-model="name"
          placeholder="new-bucket-name"
          class="h-8 font-mono text-xs"
          :invalid="problem ? 'error' : undefined"
          aria-label="New bucket name"
          @keyup.enter="create"
        />
        <Button variant="outline" size="sm" aria-label="Create bucket" :disabled="!name.trim()" @click="create">
          <FolderPlus class="h-4 w-4" />
        </Button>
      </div>
      <button type="button" class="block text-left text-xs text-muted-foreground hover:text-foreground" @click="storageOpen = true">
        Stored on: {{ placementLabel(placement) }} <span class="underline">Change</span>
      </button>
      <p v-if="problem" class="text-xs text-destructive">{{ problem }}</p>
      <p v-else-if="done" class="text-xs text-muted-foreground">{{ done }}</p>
    </footer>
    </div>
    <BucketStorageDialog v-model:open="storageOpen" v-model="placement" />
    <BucketCreateResults v-model:open="resultsOpen" :name="name.trim()" :placement="placement" />
  </aside>
</template>
