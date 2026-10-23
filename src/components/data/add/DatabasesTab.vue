<script setup lang="ts">
// Add the files of a listed database to this bucket as references. Nothing is copied.
import { ref } from 'vue'
import MockNotice from '@/components/distributed/MockNotice.vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { useMockDatabases } from '@/composables/useMockDatabases'

defineProps<{ bucket: string; prefix: string }>()

const { entries } = useMockDatabases()
const chosen = ref('')
</script>

<template>
  <div class="space-y-3">
    <MockNotice />
    <p class="text-sm text-muted-foreground">Databases your realm admins listed. You can use their files without copying them.</p>
    <ul class="divide-y divide-border rounded-md border border-border">
      <li v-for="entry in entries" :key="entry.id" class="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-foreground">{{ entry.name }}</p>
          <p class="text-xs text-muted-foreground">{{ entry.description }} {{ entry.source }}, {{ entry.license }}.</p>
        </div>
        <Button size="sm" variant="outline" @click="chosen = entry.name">Add as references</Button>
      </li>
    </ul>
    <Notice v-if="chosen" tone="success">
      Mock, nothing changed: the files of {{ chosen }} would be added to {{ bucket }}/{{ prefix }} as references (not copied).
    </Notice>
  </div>
</template>
