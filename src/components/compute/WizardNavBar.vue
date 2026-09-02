<script setup lang="ts">
// Back / Continue / Run bar shared by both run wizards. The first step's Back
// leaves the wizard, and the button says so.
import Button from '@/components/ui/Button.vue'
import { ArrowLeft, ListPlus } from '@lucide/vue'

withDefaults(
  defineProps<{
    first: boolean
    last: boolean
    canContinue: boolean
    canRun: boolean
    running?: boolean
  }>(),
  { running: false },
)
const emit = defineEmits<{ (e: 'back'): void; (e: 'next'): void; (e: 'run'): void }>()
</script>

<template>
  <div class="flex items-center justify-between">
    <Button variant="outline" size="sm" @click="emit('back')">
      <ArrowLeft v-if="first" class="h-3.5 w-3.5" /> {{ first ? 'Back to Compute' : 'Back' }}
    </Button>
    <Button v-if="!last" data-tutorial="run-continue" size="sm" :disabled="!canContinue" @click="emit('next')">Continue</Button>
    <Button v-else data-tutorial="run-submit" size="sm" :disabled="!canRun" @click="emit('run')">
      <ListPlus class="h-4 w-4" /> {{ running ? 'Starting…' : 'Run' }}
    </Button>
  </div>
</template>
