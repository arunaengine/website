<script setup lang="ts">
// The marker under an answer still being written: its label, then three dots
// that cycle. Assistive tech reads the label alone.
const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Working' })
</script>

<template>
  <span role="status" aria-live="polite" class="inline-flex items-center text-xs text-muted-foreground">
    <span>{{ props.label }}</span>
    <span class="working-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
  </span>
</template>

<style scoped>
.working-dots span {
  opacity: 0.2;
  animation: working-dot 1.2s infinite;
}

.working-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.working-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes working-dot {
  0%, 60%, 100% { opacity: 0.2; }
  30% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .working-dots span {
    opacity: 1;
    animation: none;
  }
}
</style>
