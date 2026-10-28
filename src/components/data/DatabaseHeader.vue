<script setup lang="ts">
// A database is a bucket whose metadata says so. A compact header with what the metadata says.
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useDatabases } from '@/composables/useDatabases'
import { cn } from '@/lib/utils'

const props = defineProps<{
  bucket: string
  nodeId: string | null
  /** The set of a bucket of this node; null for an ordinary one, undefined while it is not known. */
  setId?: string | null
  bare?: boolean
}>()

const databases = useDatabases()
onMounted(() => databases.ensure())

const entry = computed(() => databases.find(props.bucket, props.nodeId, props.setId))
const title = computed(() => entry.value?.title || '')
const description = computed(() => entry.value?.metadata.description ?? '')
const facts = computed(() => [entry.value?.metadata.license, entry.value?.public ? 'Public' : ''].filter(Boolean).join(' · '))
</script>

<template>
  <section v-if="entry" :class="cn('flex flex-wrap items-center gap-x-4 gap-y-2', bare ? '' : 'surface p-4')">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-foreground">{{ title || 'Database' }}</p>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      <p v-if="facts" class="text-xs text-muted-foreground">{{ facts }}</p>
    </div>
    <Button v-if="entry.datasetId" size="sm" variant="outline" as-child>
      <RouterLink :to="{ name: 'dataset', params: { id: entry.datasetId } }">Open the dataset</RouterLink>
    </Button>
  </section>
</template>
