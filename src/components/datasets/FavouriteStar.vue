<script setup lang="ts">
// Star or unstar one dataset; the filled star marks a favourite.
import { Star } from '@lucide/vue'
import IconButton from '@/components/ui/IconButton.vue'

defineProps<{ favourite: boolean; busy?: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()
</script>

<template>
  <IconButton
    :label="favourite ? 'Remove from favourites' : 'Add to favourites'"
    variant="outline"
    size="icon"
    class="h-8 w-8"
    :disabled="busy"
    :aria-pressed="favourite"
    @click.prevent.stop="emit('toggle')"
  >
    <Star class="size-3.5" :class="favourite ? 'text-status-warn' : ''" :fill="favourite ? 'currentColor' : 'none'" />
  </IconButton>
</template>
