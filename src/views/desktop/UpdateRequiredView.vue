<script setup lang="ts">
// Full-window screen for an app and a realm that run different Aruna versions.
// The node does not start until they match, so nothing else is reachable. There
// is no updater yet: Update now opens the page the new build is published on.
import { computed, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useRealm } from '@/composables/useRealm'
import { appQuit, openExternal, WIPE_PHRASE, wipeDevice } from '@/lib/desktopBridge'
import { DESKTOP_RELEASES_URL, releaseName, versionGap } from '@/lib/updateRequired'
import { errorMessage } from '@/lib/utils'
import { Download, ExternalLink, Trash2 } from '@lucide/vue'

const props = defineProps<{ local: string; realm: string }>()

const { refresh } = useDeviceStatus()
const { realm: realmInfo } = useRealm()
const confirming = ref(false)
const busy = ref(false)
const failure = ref<string | null>(null)

const gap = computed(() => versionGap(props.local, props.realm))
const name = computed(() => realmInfo.value.name)
const lead = computed(() => {
  if (gap.value === 'realm-newer') return `${name.value} has a newer version than this app.`
  if (gap.value === 'realm-older') return `${name.value} runs an older version than this app.`
  return `${name.value} runs another version than this app.`
})

async function open(): Promise<void> {
  failure.value = null
  try {
    await openExternal(DESKTOP_RELEASES_URL)
  } catch (err) {
    failure.value = errorMessage(err)
  }
}

async function wipe(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    await wipeDevice(WIPE_PHRASE)
    confirming.value = false
    await refresh()
  } catch (err) {
    failure.value = errorMessage(err)
    confirming.value = false
  } finally {
    busy.value = false
  }
}

async function quit(): Promise<void> {
  try {
    await appQuit()
  } catch (err) {
    failure.value = errorMessage(err)
  }
}
</script>

<template>
  <main class="flex min-h-full items-start justify-center bg-background px-4 py-16">
    <div class="surface w-full max-w-lg space-y-5 p-6">
      <AppLogo variant="icon" :size="22" />
      <div>
        <h1 class="font-display text-lg font-semibold text-aruna-navy">Aruna Desktop needs an update</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
          {{ lead }} They have to match to work together. Your files and your synced folders are safe.
        </p>
      </div>

      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="surface-inline px-3 py-2">
          <dt class="text-[10px] uppercase tracking-wide text-muted-foreground">This app</dt>
          <dd class="mt-0.5 font-mono text-xs text-foreground">{{ local }}</dd>
        </div>
        <div class="surface-inline px-3 py-2">
          <dt class="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{{ name }}</dt>
          <dd class="mt-0.5 font-mono text-xs text-foreground">{{ realm }}</dd>
        </div>
      </dl>

      <div v-if="gap !== 'realm-older'" class="flex flex-wrap items-center gap-3">
        <Button @click="open"><Download class="h-4 w-4" /> Update now</Button>
        <button type="button" class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" @click="open">
          What is new in {{ releaseName(realm) }} <ExternalLink class="h-3 w-3" />
        </button>
      </div>
      <p v-else class="text-sm text-muted-foreground">
        Ask the person who runs {{ name }} to update it, or install the same version of this app.
      </p>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>

      <div class="space-y-2 border-t border-border pt-4">
        <p class="text-xs leading-relaxed text-muted-foreground">
          Update does not work? You can start from scratch. This deletes what Aruna keeps on this computer. The files in
          your synced folders stay where they are.
        </p>
        <Button variant="outline" size="sm" @click="confirming = true">
          <Trash2 class="h-3.5 w-3.5" /> Remove local data and set up again
        </Button>
      </div>

      <div class="text-center">
        <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground hover:underline" @click="quit">
          Quit Aruna Desktop
        </button>
      </div>
    </div>

    <Dialog v-model:open="confirming">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove local data and set up again?</DialogTitle>
          <DialogDescription>
            This deletes what Aruna keeps on this computer. The files in your synced folders stay where they are. You
            sign in and set up this computer again afterwards.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" :disabled="busy" @click="confirming = false">Cancel</Button>
          <Button variant="destructive" :disabled="busy" @click="wipe">
            <Spinner v-if="busy" label="Removing local data…" /> Remove and set up again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>
