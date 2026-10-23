<script setup lang="ts">
// Where tools reach this computer, and where Aruna keeps its files. Both are
// owner settings of the shell; folders you sync live elsewhere.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import { useDeviceStatus } from '@/composables/useDeviceStatus'
import { nodeSettings, pickDirectory, setNodeSettings, type NodeSettings } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { FolderOpen, HardDrive } from '@lucide/vue'

// What this computer's node reports; unknown while it is down or restarts.
const { s3Url, refresh } = useDeviceStatus()

const settings = ref<NodeSettings | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saving = ref(false)
// A chosen folder waits for a yes, because taking it restarts Aruna.
const chosenPath = ref<string | null>(null)

async function load(): Promise<void> {
  try {
    settings.value = await nodeSettings()
    loadError.value = null
  } catch (err) {
    loadError.value = errorMessage(err)
  }
}

onMounted(() => void load())

async function save(patch: Partial<NodeSettings>): Promise<void> {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    settings.value = await setNodeSettings(patch)
    chosenPath.value = null
    await refresh()
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}

async function chooseStorage(): Promise<void> {
  saveError.value = null
  try {
    chosenPath.value = await pickDirectory({ title: 'Storage location', startPath: settings.value?.storagePath })
  } catch (err) {
    saveError.value = errorMessage(err)
  }
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <section class="surface flex flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div class="flex items-center gap-2">
          <HardDrive class="h-4 w-4 text-primary" />
          <h2 class="font-display text-sm font-semibold text-aruna-navy">Address for your tools</h2>
        </div>
        <Switch
          v-if="settings"
          :checked="settings.s3Enabled"
          :disabled="saving"
          aria-label="Local S3 endpoint"
          @update:checked="save({ s3Enabled: $event })"
        />
      </header>
      <div class="flex-1 space-y-3 px-5 py-4">
        <Notice v-if="loadError" tone="error">{{ loadError }}</Notice>
        <template v-else-if="settings">
          <p class="text-sm text-muted-foreground">Your tools use this address to reach your data on this computer.</p>
          <p v-if="!settings.s3Enabled" class="text-xs text-muted-foreground">
            The address is off. Turn it on with the switch above. Aruna restarts for a few seconds.
          </p>
          <div v-else-if="s3Url" class="flex flex-wrap items-center gap-3">
            <code class="surface-muted flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 font-mono text-xs">
              <span class="truncate">{{ s3Url }}</span>
              <CopyButton :value="s3Url" label="Copy address" />
            </code>
            <RouterLink :to="{ name: 'tools' }" class="text-xs font-medium text-primary hover:underline">
              Set up your tools
            </RouterLink>
          </div>
          <p v-else class="text-xs text-muted-foreground">Aruna shows the address once it is running.</p>
        </template>
      </div>
    </section>

    <section class="surface flex flex-col overflow-hidden">
      <header class="flex items-center gap-2 border-b border-border px-5 py-3">
        <FolderOpen class="h-4 w-4 text-primary" />
        <h2 class="font-display text-sm font-semibold text-aruna-navy">Storage</h2>
      </header>
      <div class="flex-1 space-y-3 px-5 py-4">
        <p class="text-sm text-muted-foreground">
          Aruna keeps copies of your data and its own files in this folder. Your synced folders are somewhere else and
          are not part of this.
        </p>
        <template v-if="settings">
          <div class="flex flex-wrap items-center gap-2">
            <code class="surface-muted min-w-0 flex-1 truncate px-3 py-2 font-mono text-xs">{{
              settings.storagePath || 'not set'
            }}</code>
            <Button variant="outline" size="sm" :disabled="saving" @click="chooseStorage">
              <FolderOpen class="h-3.5 w-3.5" /> Change
            </Button>
          </div>
          <div v-if="chosenPath" class="surface-inline space-y-2 px-3 py-2">
            <p class="text-xs text-foreground">
              Use <code class="font-mono">{{ chosenPath }}</code> instead? Aruna restarts to use the new folder.
            </p>
            <div class="flex items-center gap-2">
              <Button size="sm" :disabled="saving" @click="save({ storagePath: chosenPath })">Use this folder</Button>
              <Button variant="ghost" size="sm" @click="chosenPath = null">Cancel</Button>
            </div>
          </div>
        </template>
        <Notice v-if="saveError" tone="error">{{ saveError }}</Notice>
      </div>
    </section>
  </div>
</template>
