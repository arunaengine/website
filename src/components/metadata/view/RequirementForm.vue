<script setup lang="ts">
// The fields a repository still needs, rendered from its requirement profile and
// saved into the dataset like any editor change. Only failing fields are shown.
import { computed, ref, shallowRef, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Spinner from '@/components/ui/Spinner.vue'
import PropertyRow from '@/components/metadata/editor/PropertyRow.vue'
import { ROW_LIST } from '@/components/metadata/editor/grid'
import { useAruna } from '@/composables/useAruna'
import type { ProfileValidationFinding } from '@/lib/api'
import { displayName, findEntity, fromRoCrate, rootId, toRoCrate, type CrateDraft } from '@/lib/crate/editor'
import type { ProfileEntityRule } from '@/lib/profiles/types'
import { loadVocabIndex, type VocabIndex } from '@/lib/profiles/vocabulary'
import { requirementRows } from '@/lib/repository'
import { errorMessage } from '@/lib/utils'

const props = defineProps<{ documentId: string; findings: readonly ProfileValidationFinding[]; shapes: string }>()
const emit = defineEmits<{ (e: 'saved'): void }>()

const { fetchRoCrateRaw, replaceMetadataRoCrate, sessionEpoch } = useAruna()

const draft = shallowRef<CrateDraft | null>(null)
const entities = shallowRef<ProfileEntityRule[]>([])
const vocab = shallowRef<VocabIndex | null>(null)
const loading = ref(false)
const saving = ref(false)
const changed = ref(false)
const error = ref<string | null>(null)

let generation = 0
async function load() {
  const current = ++generation
  const epoch = sessionEpoch.value
  const fresh = () => current === generation && epoch === sessionEpoch.value
  draft.value = null
  changed.value = false
  error.value = null
  loading.value = true
  try {
    const [{ liftShapes }, crate] = await Promise.all([import('@/lib/shacl/lift'), fetchRoCrateRaw(props.documentId)])
    if (!fresh()) return
    entities.value = liftShapes(props.shapes).entities
    draft.value = fromRoCrate(crate)
  } catch (err) {
    if (fresh()) error.value = errorMessage(err)
  } finally {
    if (fresh()) loading.value = false
  }
}
watch([() => props.documentId, () => props.shapes, () => props.findings, sessionEpoch], () => void load(), { immediate: true })
void loadVocabIndex().then((index) => (vocab.value = index)).catch(() => undefined)

const rows = computed(() => (draft.value ? requirementRows(draft.value, entities.value, props.findings) : []))

function entityLabel(entityId: string): string {
  if (!draft.value || entityId === rootId(draft.value)) return ''
  return displayName(findEntity(draft.value, entityId)) || entityId
}

function update(next: CrateDraft) {
  draft.value = next
  changed.value = true
}

async function save() {
  const current = draft.value
  if (!current || saving.value) return
  const epoch = sessionEpoch.value
  const documentId = props.documentId
  saving.value = true
  error.value = null
  try {
    await replaceMetadataRoCrate(documentId, { rocrate: toRoCrate(current) })
    if (epoch !== sessionEpoch.value || documentId !== props.documentId) return
    changed.value = false
    emit('saved')
  } catch (err) {
    if (epoch === sessionEpoch.value) error.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <Spinner v-if="loading" show-label label="Loading the dataset…" class="flex text-[11px]" />
    <template v-else-if="draft && rows.length">
      <div class="divide-y divide-border" :class="ROW_LIST">
        <div v-for="row in rows" :key="`${row.entityId} ${row.property}`">
          <p v-if="entityLabel(row.entityId)" class="pt-2 text-[11px] text-muted-foreground">For {{ entityLabel(row.entityId) }}</p>
          <PropertyRow
            :draft="draft"
            :entity="findEntity(draft, row.entityId)!"
            :property="row.property"
            :vocab="vocab"
            :rule="row.rule"
            always
            @update="update"
          />
        </div>
      </div>
      <Button size="sm" :disabled="!changed || saving" @click="save">
        <Spinner v-if="saving" class="text-current" aria-hidden="true" />
        Save to the dataset
      </Button>
    </template>
    <p v-if="error" role="alert" class="text-[11px] text-destructive">{{ error }}</p>
  </div>
</template>
