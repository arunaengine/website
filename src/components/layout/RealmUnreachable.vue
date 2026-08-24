<script setup lang="ts">
// Boot dead end: the realm's API never answered, so the app shows this instead
// of views that can only spin. Naming the origin is the whole diagnosis.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { probeRealm, realmFailure, realmOrigin, realmReach } from '@/lib/desktopBoot'
import { RotateCw, ServerOff } from '@lucide/vue'

const router = useRouter()
const origin = realmOrigin()
const retrying = computed(() => realmReach.value === 'probing')

function retry(): void {
  void probeRealm()
}

function toWelcome(): void {
  void router.push({ name: 'welcome' })
}
</script>

<template>
  <div class="container flex justify-center py-16">
    <section class="surface relative w-full max-w-lg overflow-hidden p-6" aria-live="polite">
      <div
        aria-hidden="true"
        class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black_30%,transparent_80%)]"
      />
      <div class="relative">
        <ServerOff class="h-5 w-5 text-destructive" aria-hidden="true" />
        <h1 class="mt-3 font-display text-lg font-semibold tracking-tight text-aruna-navy">
          This realm is not answering
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          Aruna Desktop could not reach <span class="font-mono text-foreground">{{ origin }}</span
          >. It may be offline, or unreachable from this machine.
        </p>
        <p v-if="realmFailure" class="hash mt-2 break-all">{{ realmFailure }}</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <Button :disabled="retrying" @click="retry">
            <RotateCw :class="['h-4 w-4', retrying && 'animate-spin']" /> {{ retrying ? 'Retrying…' : 'Retry' }}
          </Button>
          <Button variant="outline" @click="toWelcome">Choose a different realm</Button>
        </div>
      </div>
    </section>
  </div>
</template>
