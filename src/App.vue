<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { signInChoice } from '@/composables/signInChoice'
import { useTheme } from '@/composables/useTheme'
import { RouterView } from 'vue-router'

const SignInDialog = defineAsyncComponent(() => import('@/components/auth/SignInDialog.vue'))

useTheme()
</script>

<template>
  <RouterView />
  <SignInDialog v-if="signInChoice" />
</template>
