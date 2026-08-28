<script setup lang="ts">
// Where the node stores its data on this computer, and whether it runs at all.
// Folder bindings live in the node itself, not here.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import Switch from '@/components/ui/Switch.vue'
import { useAruna } from '@/composables/useAruna'
import { nodeSettings, pickDirectory, setNodeSettings, type NodeSettings } from '@/lib/desktopBridge'
import { errorMessage } from '@/lib/utils'
import { FolderOpen } from '@lucide/vue'

const { nodeInfo } = useAruna()

// What the node itself reports; unknown while it restarts.
const s3Url = computed(() => nodeInfo.value?.services?.interfaces?.s3?.url ?? null)

const settings = ref<NodeSettings | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)

async function load(): Promise<void> {
  try {
    settings.value = await nodeSettings()
    loadError.value = null
  } catch (err) {
    loadError.value = errorMessage(err)
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

async function save(): Promise<void> {
  if (!settings.value || saving.value) return
  saving.value = true
  saveError.value = null
  try {
    settings.value = await setNodeSettings(settings.value)
    saved.value = true
  } catch (err) {
    saveError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="surface space-y-5 p-5">
      <div>
        <h3 class="font-display text-sm font-semibold text-aruna-navy">Storage and settings</h3>
        <p class="mt-1 text-xs text-muted-foreground">
          These apply to the node on this computer only. The realm never changes them.
        </p>
      </div>

      <Notice v-if="loadError" tone="error">{{ loadError }}</Notice>

      <template v-else-if="settings">
        <div>
          <span class="text-xs font-medium text-foreground">Storage location</span>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <code class="surface-muted min-w-0 flex-1 truncate px-3 py-2 font-mono text-xs">{{
              settings.storagePath || 'not set'
            }}</code>
            <Button variant="outline" size="sm" @click="chooseStorage"><FolderOpen class="h-3.5 w-3.5" /> Change</Button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Local S3 endpoint</span>
            <p class="text-[11px] text-muted-foreground">
              The node serves you an S3 endpoint on this computer. Changing this restarts the node.
            </p>
            <p v-if="settings.s3Enabled && s3Url" class="font-mono text-[11px] text-muted-foreground">{{ s3Url }}</p>
          </div>
          <Switch
            :checked="settings.s3Enabled"
            aria-label="Local S3 endpoint"
            @update:checked="patch({ s3Enabled: $event })"
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-medium text-foreground">Pause the node</span>
            <p class="text-[11px] text-muted-foreground">
              Stops serving, syncing and local runs until you resume it.
            </p>
          </div>
          <Switch :checked="settings.paused" @update:checked="patch({ paused: $event })" />
        </div>

        <Notice v-if="saveError" tone="error">{{ saveError }}</Notice>

        <div class="flex items-center justify-end gap-3">
          <span v-if="saved" class="text-[11px] text-muted-foreground">Saved.</span>
          <Button :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save settings' }}</Button>
        </div>
      </template>
    </div>
  </div>
</template>
