<script setup lang="ts">
// Location and labels of one node, the attributes placement policy conditions
// match on. They were set when the node joined; changing one makes that node
// re-check every copy it holds.
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import RefusalNote from '@/components/ui/RefusalNote.vue'
import Select from '@/components/ui/Select.vue'
import { useAruna } from '@/composables/useAruna'
import { usePlacement } from '@/composables/usePlacement'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage, type RealmNodeLabel } from '@/lib/api'
import { Plus, Save, Trash2 } from '@lucide/vue'

const { loadInfo, realmInfo } = useAruna()
const { busy, mutateRealmPlacement } = usePlacement()
const realmNodes = useRealmNodes()

const selected = ref('')
const location = ref('')
const labels = ref<RealmNodeLabel[]>([])
const saveError = ref<string | null>(null)
const saveMessage = ref<string | null>(null)

const nodes = computed(() => realmInfo.value?.nodes ?? [])
const options = computed(() =>
  nodes.value.map((node) => ({ value: node.node_id, label: realmNodes.displayName(node.node_id) })),
)
const node = computed(() => nodes.value.find((entry) => entry.node_id === selected.value) ?? null)
const stored = computed(() => ({
  location: node.value?.placement?.location ?? '',
  labels: Object.entries(node.value?.info?.labels ?? {}).map(([key, value]) => ({ key, value })),
}))
const dirty = computed(
  () =>
    location.value !== stored.value.location
    || JSON.stringify(labels.value) !== JSON.stringify(stored.value.labels),
)

function reset() {
  location.value = stored.value.location
  labels.value = stored.value.labels.map((label) => ({ ...label }))
  saveError.value = null
  saveMessage.value = null
}

watch(nodes, (list) => {
  if (!selected.value && list.length) selected.value = list[0].node_id
}, { immediate: true })
watch(selected, reset, { immediate: true })

async function save() {
  if (!node.value || !dirty.value || busy.value) return
  saveError.value = null
  saveMessage.value = null
  try {
    await mutateRealmPlacement({
      mutation: 'set_node_attributes',
      node_id: node.value.node_id,
      location: location.value.trim(),
      labels: labels.value
        .map((label) => ({ key: label.key.trim(), value: label.value.trim() }))
        .filter((label) => label.key),
    })
    await loadInfo().catch(() => undefined)
    saveMessage.value = 'Saved. That node now re-checks the copies it holds.'
  } catch (error) {
    saveError.value = apiErrorMessage(error)
  }
}
</script>

<template>
  <section class="surface">
    <header class="flex items-center gap-2 border-b border-border px-5 py-4">
      <h2 class="font-display text-sm font-semibold text-aruna-navy">Node attributes</h2>
      <Badge variant="outline" size="sm">Matched by placement policies</Badge>
    </header>

    <div class="space-y-4 px-5 py-4">
      <Notice tone="warning">
        A changed location or label makes that node re-check the copies it holds, and it holds back
        the ones that no longer fit their rules.
      </Notice>

      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-56">
          <label class="text-[11px] font-medium text-foreground">Node</label>
          <Select
            v-model="selected"
            :options="options"
            class="mt-1"
            :disabled="busy"
            aria-label="Node whose attributes to edit"
          />
        </div>
        <div class="min-w-56 flex-1">
          <label for="node-location" class="text-[11px] font-medium text-foreground">Location</label>
          <Input
            id="node-location"
            v-model="location"
            class="mt-1"
            placeholder="No location"
            :disabled="busy"
          />
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-medium text-foreground">Labels</span>
          <Button size="sm" variant="ghost" :disabled="busy" @click="labels.push({ key: '', value: '' })">
            <Plus class="size-3.5" /> Add label
          </Button>
        </div>
        <div v-if="labels.length" class="mt-1.5 space-y-1.5">
          <div v-for="(label, index) in labels" :key="index" class="flex items-center gap-2">
            <Input v-model="label.key" class="font-mono text-xs" placeholder="key" :aria-label="`Label key ${index + 1}`" />
            <span class="text-muted-foreground">=</span>
            <Input v-model="label.value" class="font-mono text-xs" placeholder="value" :aria-label="`Label value ${index + 1}`" />
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-destructive hover:text-destructive"
              :aria-label="`Remove label ${index + 1}`"
              :disabled="busy"
              @click="labels.splice(index, 1)"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
        </div>
        <p v-else class="mt-1.5 text-[11px] text-muted-foreground">This node publishes no label.</p>
      </div>

      <RefusalNote v-if="saveError" :message="saveError" />
      <p v-else-if="saveMessage" class="text-xs text-emerald-700 dark:text-emerald-300">{{ saveMessage }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="!dirty || busy" @click="save">
          <Save class="size-3.5" /> Save attributes
        </Button>
        <Button variant="ghost" size="sm" :disabled="!dirty || busy" @click="reset">Reset</Button>
        <span v-if="!dirty" class="text-[11px] text-muted-foreground">Nothing changed yet.</span>
      </div>
    </div>
  </section>
</template>
