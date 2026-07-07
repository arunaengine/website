<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { AlertTriangle } from '@lucide/vue'

// retryLabel defaults to "Try again", so the retry button renders by default;
// pass retryLabel="" to hide it when a retry action makes no sense.
withDefaults(defineProps<{ message: string; retryLabel?: string }>(), {
  retryLabel: 'Try again',
})
defineEmits<{ (e: 'retry'): void }>()
</script>

<template>
  <div class="surface flex flex-col items-center gap-3 border-destructive/30 bg-destructive/5 px-5 py-8 text-center">
    <AlertTriangle class="h-5 w-5 text-destructive" />
    <p class="text-sm text-destructive">{{ message }}</p>
    <Button v-if="retryLabel" variant="outline" size="sm" @click="$emit('retry')">{{ retryLabel }}</Button>
  </div>
</template>
