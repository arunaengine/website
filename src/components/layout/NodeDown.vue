<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import FactList from '@/components/ui/FactList.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { setNodeSettings } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { Play, ServerOff } from '@lucide/vue'

const { status, state, refresh } = useDeviceStatus()
const busy = ref(false)
const actionError = ref<string | null>(null)

const stopped = computed(() => state.value === 'stopped')
const realmMismatch = computed(() => status.value?.realmMismatch ?? null)
const headline = computed(() =>
  realmMismatch.value
    ? 'The realm was recreated'
    : stopped.value
      ? "This computer's node is not running."
      : "This computer's node failed.",
)
const detail = computed(() =>
  realmMismatch.value
    ? (status.value?.detail ?? status.value?.message)
    : stopped.value
      ? (status.value?.message ?? 'Aruna Desktop needs its node to work.')
      : (status.value?.detail ?? status.value?.message),
)

const facts = computed(() => {
  const mismatch = realmMismatch.value
  if (!mismatch) return []
  return [
    { key: 'url', label: 'Realm', value: mismatch.realmUrl },
    { key: 'expected', label: 'Expected realm', value: mismatch.expected, mono: true },
    { key: 'actual', label: 'Actual realm', value: mismatch.actual, mono: true },
  ]
})

async function startNode(): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = null
  try {
    await setNodeSettings({ paused: false })
    await refresh()
  } catch (err) {
    actionError.value = errorMessage(err)
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
        <template v-if="realmMismatch">
          <FactList :items="facts" class="mt-3">
            <template #url>
              <code :title="realmMismatch.realmUrl" class="block truncate font-mono text-xs">{{
                realmMismatch.realmUrl
              }}</code>
            </template>
            <template #expected>
              <code :title="realmMismatch.expected" class="block truncate font-mono text-xs">{{
                realmMismatch.expected
              }}</code>
            </template>
            <template #actual>
              <code :title="realmMismatch.actual" class="block truncate font-mono text-xs">{{
                realmMismatch.actual
              }}</code>
            </template>
          </FactList>
          <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
            This computer's data belongs to the old realm. Wipe it before setting it up with the recreated realm.
          </p>
        </template>
        <Notice v-if="actionError" tone="error" class="mt-2">{{ actionError }}</Notice>
        <div class="mt-5 flex flex-wrap gap-2">
          <Button v-if="!realmMismatch" :disabled="busy" @click="startNode">
            <Spinner v-if="busy" label="Starting…" show-label />
            <template v-else><Play class="h-4 w-4" aria-hidden="true" /> Start the node</template>
          </Button>
          <Button v-if="realmMismatch" variant="destructive" as-child>
            <RouterLink :to="{ name: 'device', query: { section: 'wipe' } }">
              Wipe this device and set it up again
            </RouterLink>
          </Button>
          <Button v-else variant="outline" as-child>
            <RouterLink :to="{ name: 'device' }">Open the device page</RouterLink>
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
