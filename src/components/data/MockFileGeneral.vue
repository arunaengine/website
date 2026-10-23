<script setup lang="ts">
// What file details add for an example file: origin, datasets it is part of, ids and preview.
import { computed, ref } from 'vue'
import DatasetOrigin from '@/components/data/DatasetOrigin.vue'
import OriginLine from '@/components/data/OriginLine.vue'
import GlobalId from '@/components/distributed/GlobalId.vue'
import { RouterLink } from 'vue-router'
import { useMockDatabases } from '@/composables/useMockDatabases'
import { originOf, type MockObject } from '@/lib/distributedMockData'

const props = defineProps<{ object: MockObject }>()

const { partOf } = useMockDatabases()
const parts = computed(() => partOf(props.object.bucket, props.object.key))
// A file can be part of many datasets, so a few show first.
const LIMIT = 3
const more = ref(false)
const shownParts = computed(() => (more.value ? parts.value : parts.value.slice(0, LIMIT)))
</script>

<template>
  <div class="space-y-3 text-xs">
    <div>
      <p class="mb-1 text-muted-foreground">Origin</p>
      <OriginLine :origin="originOf(object)" />
    </div>
    <div v-if="parts.length">
      <p class="mb-1 text-muted-foreground">Part of</p>
      <ul class="space-y-0.5">
        <li v-for="item in shownParts" :key="item.dataset.id">
          <RouterLink :to="{ name: 'dataset', params: { id: item.dataset.id } }" class="font-medium text-primary hover:underline">{{ item.dataset.name }}</RouterLink>
          <span class="text-muted-foreground">
            ({{ item.database ? 'database' : item.part.kind === 'folder' ? 'linked folder' : 'linked bucket' }})
          </span>
        </li>
      </ul>
      <button v-if="parts.length > LIMIT" type="button" class="mt-1 text-primary hover:underline" @click="more = !more">
        {{ more ? 'Show fewer datasets' : `${parts.length - LIMIT} more ${parts.length - LIMIT === 1 ? 'dataset' : 'datasets'}` }}
      </button>
    </div>
    <div>
      <p class="mb-1 text-muted-foreground">Id of this version</p>
      <GlobalId :version-id="object.versionId" :content-hash="object.contentHash" />
      <p class="mt-1 text-muted-foreground">The id names no node. Any node of the realm can resolve it.</p>
    </div>
    <div>
      <p class="mb-1 text-muted-foreground">Datasets that use this file</p>
      <ul class="list-disc space-y-0.5 pl-5 text-foreground">
        <li v-for="title in object.datasets" :key="title">{{ title }}</li>
      </ul>
    </div>
    <div>
      <p class="mb-1 text-muted-foreground">Added to datasets as</p>
      <DatasetOrigin :key="object.versionId" :origin="originOf(object)" :part-of="parts" />
    </div>
  </div>
</template>
