<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { setNodeSettings } from '@/lib/desktopBridge'
import { Loader2, Play, ServerOff } from '@lucide/vue'

const { status, state, refresh } = useDeviceStatus()
const busy = ref(false)
const actionError = ref<string | null>(null)

const stopped = computed(() => state.value === 'stopped')
const headline = computed(() =>
  stopped.value ? "This device's node is not running." : "This device's node failed.",
)
const detail = computed(() =>
  stopped.value
    ? (status.value?.message ?? 'Aruna Desktop needs its node to work.')
    : (status.value?.detail ?? status.value?.message),
)

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function startNode(): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = null
  try {
    await setNodeSettings({ paused: false })
    await refresh()
  } catch (err) {
    actionError.value = message(err)
  } finally {
    busy.value = false
  }
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
        <h1 class="mt-3 font-display text-lg font-semibold tracking-tight text-aruna-navy">{{ headline }}</h1>
        <p v-if="detail" class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ detail }}</p>
        <p v-if="actionError" class="hash mt-2 break-all">{{ actionError }}</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <Button :disabled="busy" @click="startNode">
            <Loader2 v-if="busy" class="h-4 w-4 animate-spin" aria-hidden="true" />
            <Play v-else class="h-4 w-4" aria-hidden="true" />
            {{ busy ? 'Starting…' : 'Start the node' }}
          </Button>
          <Button variant="outline" as-child>
            <RouterLink :to="{ name: 'device' }">Open This device</RouterLink>
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
