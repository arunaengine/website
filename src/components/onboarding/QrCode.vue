<script setup lang="ts">
// Self-contained QR renderer for the enrollment hand-off (aruna#271). The
// module matrix is drawn as one path rather than injecting uqr's SVG string,
// and the colours stay literal black on white in both themes; an inverted QR
// code is unreliable to scan.
import { computed } from 'vue'
import { encode } from 'uqr'

const props = withDefaults(defineProps<{ value: string; label?: string; border?: number }>(), {
  label: 'QR code',
  border: 2,
})

const code = computed(() => encode(props.value, { border: props.border }))

const path = computed(() => {
  const parts: string[] = []
  code.value.data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x} ${y}h1v1h-1z`)
    })
  })
  return parts.join('')
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${code.size} ${code.size}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
    class="h-full w-full"
  >
    <rect :width="code.size" :height="code.size" fill="#ffffff" />
    <path :d="path" fill="#000000" />
  </svg>
</template>
