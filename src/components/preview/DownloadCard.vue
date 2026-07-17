<script setup lang="ts">
import ObjectIcon from '@/components/data/ObjectIcon.vue'
import Button from '@/components/ui/Button.vue'
import { formatBytes } from '@/lib/utils'
import { Download } from '@lucide/vue'

const props = defineProps<{ name: string; size?: number; note?: string | null }>()
defineEmits<{ (e: 'download'): void }>()
</script>

<template>
  <div class="surface flex flex-col items-center gap-3 px-5 py-10 text-center">
    <ObjectIcon :name="props.name" class="h-9 w-9" />
    <div>
      <p class="break-all text-sm font-medium text-foreground">{{ props.name }}</p>
      <p v-if="props.size !== undefined" class="mt-0.5 font-mono text-xs text-muted-foreground">
        {{ formatBytes(props.size) }}
      </p>
    </div>
    <p class="max-w-sm text-sm text-muted-foreground">
      {{ props.note || 'This file type cannot be previewed in the browser.' }}
    </p>
    <Button variant="outline" size="sm" @click="$emit('download')">
      <Download class="h-4 w-4" /> Download
    </Button>
  </div>
</template>
