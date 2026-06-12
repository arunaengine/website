<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { RouterView } from 'vue-router'

useTheme()
</script>

<template>
  <RouterView />
</template>
