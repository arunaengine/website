<script setup lang="ts">
// Boot dead end: the realm's API never answered, so the app shows this instead
// of views that can only spin. Naming the origin is the whole diagnosis.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import RefreshButton from '@/components/ui/RefreshButton.vue'
import { probeRealm, realmFailure, realmOrigin, realmReach } from '@/lib/desktopBoot'
import { ServerOff } from '@lucide/vue'

const router = useRouter()
const origin = realmOrigin()
const retrying = computed(() => realmReach.value === 'probing')

function retry(): void {
  void probeRealm()
}

function toWelcome(): void {
  void router.push({ name: 'welcome', query: { change: '1' } })
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
        <h1 class="mt-3 font-display text-lg font-semibold tracking-tight text-aruna-navy">Realm unreachable</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          Aruna Desktop could not reach <span class="font-mono text-foreground">{{ origin }}</span
          >. It may be down, or unreachable from this computer.
        </p>
        <Notice v-if="realmFailure" tone="error" class="mt-2">{{ realmFailure }}</Notice>
        <div class="mt-5 flex flex-wrap gap-2">
          <RefreshButton
            :busy="retrying"
            variant="default"
            size="default"
            :label="retrying ? 'Retrying…' : 'Retry'"
            @click="retry"
          />
          <Button variant="outline" @click="toWelcome">Choose a different realm</Button>
        </div>
      </div>
    </section>
  </div>
</template>
