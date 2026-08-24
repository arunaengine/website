<script setup lang="ts">
// Local control surface of the embedded node: where it stores data, which
// directories it offers to the realm, and whether it runs. Wiping is here too
// because it is the one action that destroys the local identity.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { nodeSettings, pickDirectory, setNodeSettings, wipeDevice, type NodeSettings } from '@/lib/desktopBridge'
import { FolderOpen, Trash2, X } from '@lucide/vue'

// Echoed back to the shell, which demands the phrase before it wipes anything.
const WIPE_PHRASE = 'wipe'

const settings = ref<NodeSettings | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)
const wipeInput = ref('')
const wipeError = ref<string | null>(null)
const wiping = ref(false)

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function load(): Promise<void> {
  try {
    settings.value = await nodeSettings()
    loadError.value = null
  } catch (err) {
    loadError.value = message(err)
  }
}

onMounted(() => void load())

function patch(change: Partial<NodeSettings>): void {
  if (!settings.value) return
  settings.value = { ...settings.value, ...change }
  saved.value = false
}

async function chooseStorage(): Promise<void> {
  const picked = await pickDirectory({ title: 'Storage location', startPath: settings.value?.storagePath })
  if (picked) patch({ storagePath: picked })
}

async function offerDirectory(): Promise<void> {
  const picked = await pickDirectory({ title: 'Offer a directory to the realm' })
  if (!picked || settings.value?.offeredDirectories.includes(picked)) return
  patch({ offeredDirectories: [...(settings.value?.offeredDirectories ?? []), picked] })
}

function dropDirectory(path: string): void {
  patch({ offeredDirectories: (settings.value?.offeredDirectories ?? []).filter((entry) => entry !== path) })
}

async function save(): Promise<void> {
  if (!settings.value || saving.value) return
  saving.value = true
  saveError.value = null
  try {
    settings.value = await setNodeSettings(settings.value)
    saved.value = true
  } catch (err) {
    saveError.value = message(err)
  } finally {
    saving.value = false
  }
}

const canWipe = computed(() => wipeInput.value.trim().toLowerCase() === WIPE_PHRASE)

async function wipe(): Promise<void> {
  if (!canWipe.value || wiping.value) return
  wiping.value = true
  wipeError.value = null
  try {
    await wipeDevice(wipeInput.value.trim())
    wipeInput.value = ''
    await load()
  } catch (err) {
    wipeError.value = message(err)
  } finally {
    wiping.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="surface space-y-5 p-5">
      <div>
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Local settings</h3>
        <p class="mt-1 text-xs text-muted-foreground">
          These apply to the node on this machine only. The realm never changes them.
        </p>
      </div>

      <p
        v-if="loadError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ loadError }}
      </p>

      <template v-else-if="settings">
        <div>
          <span class="text-xs font-medium text-foreground">Storage location</span>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <code class="min-w-0 flex-1 truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs">{{
              settings.storagePath || 'not set'
            }}</code>
            <Button variant="outline" size="sm" @click="chooseStorage"><FolderOpen class="h-3.5 w-3.5" /> Change</Button>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-foreground">Offered directories</span>
            <Button variant="outline" size="sm" @click="offerDirectory">
              <FolderOpen class="h-3.5 w-3.5" /> Offer a directory
            </Button>
          </div>
          <p class="mt-1 text-[11px] text-muted-foreground">
            Realm nodes pull from these; nothing leaves the device until a realm node asks for it.
          </p>
          <ul v-if="settings.offeredDirectories.length" class="mt-2 space-y-1">
            <li
              v-for="path in settings.offeredDirectories"
              :key="path"
              class="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5"
            >
              <code class="min-w-0 flex-1 truncate font-mono text-xs">{{ path }}</code>
              <Button variant="ghost" size="icon-sm" :aria-label="`Stop offering ${path}`" @click="dropDirectory(path)">
                <X class="h-3.5 w-3.5" />
              </Button>
            </li>
          </ul>
          <p v-else class="mt-2 text-xs text-muted-foreground">No directories are offered.</p>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Pause the node</span>
            <p class="text-[11px] text-muted-foreground">Stops serving and syncing until you resume it.</p>
          </div>
          <Switch :checked="settings.paused" @update:checked="patch({ paused: $event })" />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Start with the app</span>
            <p class="text-[11px] text-muted-foreground">Runs the node whenever Aruna Desktop opens.</p>
          </div>
          <Switch :checked="settings.autoStart" @update:checked="patch({ autoStart: $event })" />
        </div>

        <p
          v-if="saveError"
          class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {{ saveError }}
        </p>

        <div class="flex items-center justify-end gap-3">
          <span v-if="saved" class="text-[11px] text-muted-foreground">Saved.</span>
          <Button :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save settings' }}</Button>
        </div>
      </template>
    </div>

    <div class="surface space-y-3 border-destructive/30 p-5">
      <h3 class="font-display text-sm font-semibold text-destructive">Wipe this device</h3>
      <p class="text-xs leading-relaxed text-muted-foreground">
        Destroys the local identity and everything stored here, and removes the device from the realm. Data that exists
        only on this device is lost. Type <code class="font-mono">{{ WIPE_PHRASE }}</code> to confirm.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Input v-model="wipeInput" :placeholder="WIPE_PHRASE" class="max-w-[12rem]" aria-label="Wipe confirmation" />
        <Button variant="outline" :disabled="!canWipe || wiping" @click="wipe">
          <Trash2 class="h-3.5 w-3.5" /> {{ wiping ? 'Wiping…' : 'Wipe device' }}
        </Button>
      </div>
      <p
        v-if="wipeError"
        class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
      >
        {{ wipeError }}
      </p>
    </div>
  </div>
</template>
