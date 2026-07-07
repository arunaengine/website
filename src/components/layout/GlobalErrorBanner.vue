<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { X } from '@lucide/vue'
import { useRoute } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useGlobalErrors } from '@/composables/useGlobalErrors'

const route = useRoute()
const { error, authError, refresh } = useAruna()
const { signIn } = useAuth()
const { errors, dismissGlobalError } = useGlobalErrors()

function onSignIn() {
  void signIn({ redirectTo: route.fullPath })
}
</script>

<template>
  <div v-if="authError || error || errors.length">
    <div
      v-if="authError"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
    >
      <span>Your session is no longer valid: {{ authError }}</span>
      <Button variant="outline" size="sm" class="shrink-0" @click="onSignIn">Sign in</Button>
    </div>
    <div
      v-if="error"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span>API error: {{ error }}</span>
      <Button variant="outline" size="sm" class="shrink-0" @click="refresh">Retry</Button>
    </div>
    <div
      v-for="e in errors"
      :key="e.id"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span>{{ e.message }}</span>
      <button class="shrink-0 rounded-md p-1 hover:bg-destructive/15" aria-label="Dismiss" @click="dismissGlobalError(e.id)">
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
