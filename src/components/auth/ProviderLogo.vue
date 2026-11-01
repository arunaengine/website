<script setup lang="ts">
// A login provider logo in a fixed box, so names line up; white logos get a light-mode copy.
defineProps<{ logo: string; logoLight?: string; large?: boolean }>()
</script>

<template>
  <span class="flex h-8 w-14 shrink-0 items-center justify-center overflow-hidden">
    <template v-if="logoLight">
      <img :src="logoLight" alt="" class="max-h-7 max-w-full object-contain dark:hidden" />
      <img :src="logo" alt="" class="hidden max-h-7 max-w-full object-contain dark:block" />
    </template>
    <img v-else :src="logo" alt="" :class="large ? 'h-12 max-w-none' : 'max-h-7 max-w-full object-contain'" />
  </span>
</template>
