<script setup lang="ts">
// The three refusals every compute surface shares: the feature is off, the
// session has not resolved yet, or nobody is signed in. The default slot is the
// surface itself and only renders once all three pass.
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useAruna } from '@/composables/useAruna'
import { useAuth } from '@/composables/useAuth'
import { Cpu, LogIn } from '@lucide/vue'

const props = defineProps<{
  enabled: boolean
  disabledDescription: string
  signInTitle: string
  signInDescription: string
  redirectTo: string
}>()

const { currentUser } = useAruna()
const { signIn, stage, authPending } = useAuth()

const signingIn = computed(() => stage.value === 'redirecting')
function startSignIn() {
  void signIn({ redirectTo: props.redirectTo })
}
</script>

<template>
  <div v-if="!enabled" class="container py-8">
    <EmptyState title="Compute is not enabled" :description="disabledDescription">
      <template #icon><Cpu class="h-7 w-7" /></template>
    </EmptyState>
  </div>

  <!-- A stored token is still resolving, so never flash the signed-out gate. -->
  <div v-else-if="authPending" class="container py-8">
    <section class="surface mx-auto max-w-xl space-y-3 p-8">
      <Skeleton class="mx-auto h-8 w-8 rounded-full" />
      <Skeleton class="mx-auto h-4 w-44" />
      <Skeleton class="mx-auto h-3 w-64" />
    </section>
  </div>

  <div v-else-if="!currentUser" class="container py-8">
    <section class="surface mx-auto max-w-xl p-8 text-center">
      <Cpu class="mx-auto h-8 w-8 text-muted-foreground/70" />
      <h2 class="mt-3 font-display text-base font-semibold text-aruna-navy">{{ signInTitle }}</h2>
      <p class="mt-1.5 text-sm text-muted-foreground">{{ signInDescription }}</p>
      <Button class="mt-4" size="sm" :disabled="signingIn" @click="startSignIn">
        <LogIn class="h-3.5 w-3.5" /> Sign in
      </Button>
    </section>
  </div>

  <slot v-else />
</template>
