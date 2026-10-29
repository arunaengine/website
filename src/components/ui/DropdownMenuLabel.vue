<script setup lang="ts">
import { DropdownMenuLabel } from 'radix-vue'
</script>
<template>
  <DropdownMenuLabel class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
    <slot />
  </DropdownMenuLabel>
</template>
