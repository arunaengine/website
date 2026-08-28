<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { X } from '@lucide/vue'
import { useRoute } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useGlobalErrors } from '@/composables/useGlobalErrors'

// A banner is the notice run edge to edge, so it drops the rounding and keeps
// only its bottom rule.
const BANNER = 'flex items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-2 text-sm'

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
    <Notice v-if="authError" tone="warning" :class="BANNER">
      <span>Your session is no longer valid: {{ authError }}</span>
      <Button variant="outline" size="sm" class="shrink-0" @click="onSignIn">Sign in</Button>
    </Notice>
    <Notice v-if="error" tone="error" :class="BANNER">
      <span>API error: {{ error }}</span>
      <Button variant="outline" size="sm" class="shrink-0" @click="refresh">Retry</Button>
    </Notice>
    <Notice v-for="e in errors" :key="e.id" tone="error" :class="BANNER">
      <span>{{ e.message }}</span>
      <button
        class="shrink-0 rounded-md p-1 hover:bg-destructive/15"
        aria-label="Dismiss"
        @click="dismissGlobalError(e.id)"
      >
        <X class="h-4 w-4" />
      </button>
    </Notice>
  </div>
</template>
