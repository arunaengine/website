<script setup lang="ts">
// Full-window screen for an app and a realm that run different Aruna versions.
// The node does not start until they match, so nothing else is reachable. When
// the shell has a signed build of the realm's version it installs it here and
// restarts; otherwise the owner is told where to get one.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import Notice from '@/components/ui/Notice.vue'
import Progress from '@/components/ui/Progress.vue'
import Spinner from '@/components/ui/Spinner.vue'
import AppLogo from '@/components/layout/AppLogo.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { useNodeControl } from '@/composables/useNodeControl'
import { useRealm } from '@/composables/useRealm'
import {
  appQuit,
  appRestart,
  BridgeUnavailable,
  openExternal,
  updateCheck,
  updateInstall,
  WIPE_PHRASE,
  wipeDevice,
} from '@/lib/desktopBridge'
import { onUpdateProgress, type UpdateProgress, type Unlisten } from '@/lib/desktopEvents'
import { DESKTOP_DOWNLOAD_HELP, DESKTOP_DOWNLOAD_URL, releaseName, versionGap } from '@/lib/updateRequired'
import { errorMessage, formatBytes } from '@/lib/utils'
import { Download, ExternalLink, RefreshCw, RotateCw, Trash2 } from '@lucide/vue'

const props = defineProps<{ local: string; realm: string }>()

const { status, refresh } = useDeviceStatus()
const control = useNodeControl()
const { realm: realmInfo } = useRealm()
const confirming = ref(false)
const busy = ref(false)
const failure = ref<string | null>(null)
const checked = ref(false)

// 'none' means only a download can update this app: no signed build, or an older shell.
type Phase = 'checking' | 'ready' | 'none' | 'downloading' | 'installed'
const phase = ref<Phase>('checking')
const updateError = ref<string | null>(null)
const progress = ref<UpdateProgress | null>(null)
let generation = 0
let unlisten: Unlisten | null = null

const gap = computed(() => versionGap(props.local, props.realm))
const name = computed(() => realmInfo.value.name)
const lead = computed(() => {
  if (gap.value === 'realm-newer') return `${name.value} has a newer version than this app.`
  if (gap.value === 'realm-older') return `${name.value} runs an older version than this app.`
  return `${name.value} runs another version than this app.`
})

const percent = computed(() => {
  const current = progress.value
  return current?.total ? Math.min(100, Math.floor((current.downloaded / current.total) * 100)) : null
})
const progressLabel = computed(() => {
  if (percent.value !== null) return `Downloading the update, ${percent.value}%`
  const downloaded = progress.value?.downloaded ?? 0
  return downloaded ? `Downloading the update, ${formatBytes(downloaded)}` : 'Downloading the update'
})
const fallback = computed(() => phase.value === 'none' || updateError.value !== null)

async function check(): Promise<void> {
  const current = ++generation
  updateError.value = null
  if (gap.value === 'realm-older') {
    phase.value = 'none'
    return
  }
  phase.value = 'checking'
  try {
    const offer = await updateCheck()
    if (current !== generation) return
    phase.value = offer ? 'ready' : 'none'
  } catch (err) {
    if (current !== generation) return
    phase.value = 'none'
    if (!(err instanceof BridgeUnavailable)) updateError.value = `Could not look for the update: ${errorMessage(err)}`
  }
}

watch(() => props.realm, check, { immediate: true })

function stopListening(): void {
  unlisten?.()
  unlisten = null
}

onBeforeUnmount(() => {
  generation += 1
  stopListening()
})

async function install(): Promise<void> {
  const current = generation
  updateError.value = null
  progress.value = null
  phase.value = 'downloading'
  stopListening()
  unlisten = await onUpdateProgress((next) => {
    if (current === generation) progress.value = next
  })
  try {
    await updateInstall()
    if (current === generation) phase.value = 'installed'
  } catch (err) {
    if (current !== generation) return
    phase.value = 'ready'
    updateError.value = `The update failed: ${errorMessage(err)}`
  } finally {
    stopListening()
  }
}

async function restart(): Promise<void> {
  failure.value = null
  try {
    await appRestart()
  } catch (err) {
    failure.value = errorMessage(err)
  }
}

async function open(): Promise<void> {
  failure.value = null
  if (!DESKTOP_DOWNLOAD_URL) return
  try {
    await openExternal(DESKTOP_DOWNLOAD_URL)
  } catch (err) {
    failure.value = errorMessage(err)
  }
}

// The shell looks at the realm again whenever it is asked to start the node.
async function checkAgain(): Promise<void> {
  failure.value = null
  checked.value = false
  await control.start()
  checked.value = true
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
          {{ lead }} They have to match to work together. Your files and your linked folders are safe.
        </p>
      </div>

      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="surface-inline px-3 py-2">
          <dt class="text-xs text-muted-foreground">This app</dt>
          <dd class="mt-0.5 font-mono text-xs text-foreground">{{ local }}</dd>
        </div>
        <div class="surface-inline px-3 py-2">
          <dt class="truncate text-xs text-muted-foreground">{{ name }}</dt>
          <dd class="mt-0.5 font-mono text-xs text-foreground">{{ realm }}</dd>
        </div>
      </dl>

      <template v-if="gap !== 'realm-older'">
        <Spinner v-if="phase === 'checking'" label="Looking for the update…" show-label />
        <div v-else-if="phase === 'ready'" class="flex flex-wrap items-center gap-3">
          <Button @click="install">
            <Download class="h-4 w-4" /> {{ updateError ? 'Try again' : `Update to ${realm}` }}
          </Button>
        </div>
        <div v-else-if="phase === 'downloading'" class="space-y-2">
          <Progress :value="percent ?? 0" :indeterminate="percent === null" :warn="101" :critical="101" :label="progressLabel" />
          <p class="text-xs text-muted-foreground">{{ progressLabel }}. Keep the app open.</p>
        </div>
        <div v-else-if="phase === 'installed'" class="space-y-3">
          <p class="text-sm text-foreground">The update is installed. Restart Aruna Desktop to use it.</p>
          <Button @click="restart"><RotateCw class="h-4 w-4" /> Restart now</Button>
        </div>
        <Notice v-if="updateError" tone="error">{{ updateError }}</Notice>
        <Button v-if="updateError && phase === 'none'" variant="outline" size="sm" @click="check">
          <RefreshCw class="h-3.5 w-3.5" /> Look again
        </Button>

        <template v-if="fallback">
          <p class="text-sm text-muted-foreground">{{ DESKTOP_DOWNLOAD_HELP }}</p>
          <div v-if="DESKTOP_DOWNLOAD_URL" class="flex flex-wrap items-center gap-3">
            <Button variant="outline" @click="open"><Download class="h-4 w-4" /> Download the update</Button>
            <button type="button" class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" @click="open">
              What is new in {{ releaseName(realm) }} <ExternalLink class="h-3 w-3" />
            </button>
          </div>
        </template>
      </template>
      <p v-else class="text-sm text-muted-foreground">
        Ask the person who runs {{ name }} to update it, or install the same version of this app. This app does not
        install an older version itself, because the data on this computer may not work with it.
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" :disabled="control.busy.value || phase === 'downloading'" @click="checkAgain">
          <RefreshCw class="h-3.5 w-3.5" /> Check again
        </Button>
        <span v-if="checked && status?.updateRequired" class="text-xs text-muted-foreground">
          The versions still differ.
        </span>
      </div>
      <Notice v-if="control.error.value" tone="error">{{ control.error.value }}</Notice>

      <Notice v-if="failure" tone="error">{{ failure }}</Notice>

      <div class="space-y-2 border-t border-border pt-4">
        <p class="text-xs leading-relaxed text-muted-foreground">
          Update does not work? You can start from scratch. This deletes what Aruna keeps on this computer. Data that
          exists only on this computer is lost, and your folder links disappear. The files in your linked folders stay
          where they are.
        </p>
        <Button variant="outline" size="sm" @click="confirming = true">
          <Trash2 class="h-3.5 w-3.5" /> Remove local data and set up again
        </Button>
      </div>

      <div class="text-center">
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground hover:underline" @click="quit">
          Quit Aruna Desktop
        </button>
      </div>
    </div>

    <Dialog v-model:open="confirming">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove local data and set up again?</DialogTitle>
          <DialogDescription>
            This deletes what Aruna keeps on this computer. Data that exists only on this computer is lost, and your
            folder links disappear. The files in your linked folders stay where they are. You set up this computer
            again afterwards.
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
