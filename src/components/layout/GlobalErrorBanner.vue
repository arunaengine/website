<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { WifiOff, X } from '@lucide/vue'
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { useGlobalErrors } from '@/composables/useGlobalErrors'
import { useConnectivity } from '@/lib/connectivity'

const route = useRoute()
const { error, authError, refresh } = useAruna()
const { signIn } = useAuth()
const { errors, dismissGlobalError } = useGlobalErrors()
const { offline, nodeReachable } = useConnectivity()

// Reconnect reconciliation: one refresh when connectivity returns, so stale
// reads converge without the user hunting for a reload button.
watch(offline, (now, was) => {
  if (was && !now) void refresh()
})

function onSignIn() {
  void signIn({ redirectTo: route.fullPath })
}
</script>

<template>
  <div v-if="authError || error || errors.length || offline">
    <div
      v-if="offline"
      role="status"
      class="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
    >
      <span class="flex min-w-0 items-center gap-2">
        <WifiOff class="h-4 w-4 shrink-0" />
        <span v-if="nodeReachable">
          You appear to be offline. Browsing, search and SPARQL keep working over this node's local data, but
          content from other nodes may be stale — and writes need connectivity.
        </span>
        <span v-else>
          This portal cannot reach its node — showing the last loaded data. Reads may be stale and writes need
          connectivity.
        </span>
      </span>
      <Button variant="outline" size="sm" class="shrink-0" @click="refresh">Retry</Button>
    </div>
    <div
      v-if="authError"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
    >
      <span>Your session is no longer valid: {{ authError }}</span>
      <Button variant="outline" size="sm" class="shrink-0" @click="onSignIn">Sign in</Button>
    </div>
    <div
      v-if="error && !offline"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <!-- Suppressed while offline: the offline row already owns the Retry
           affordance, so a redundant "API error: Failed to fetch" would be noise. -->
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
