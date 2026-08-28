<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, FileCode2, AlertTriangle } from '@lucide/vue'
import Notice from '@/components/ui/Notice.vue'
import type { LiftNote } from '@/lib/shacl/lift'

// What an imported SHACL file could not become. Rendered next to the rules (and
// again at review) so "there is no input for X" is visible where the author
// works, instead of only in the import confirmation they already dismissed.
const props = defineProps<{
  notes: LiftNote[]
  // Whether the source constraints are preserved in the unified shapes.ttl.
  attached: boolean
}>()

const noField = computed(() => props.notes.filter((note) => note.kind === 'no-field'))
const partial = computed(() => props.notes.filter((note) => note.kind === 'partial'))
const detailsOpen = ref(false)

function scopeText(note: LiftNote): string {
  if (!note.scopes.length) return ''
  if (note.scopes.length <= 3) return note.scopes.join(', ')
  return `${note.scopes.slice(0, 3).join(', ')} and ${note.scopes.length - 3} more`
}
</script>

<template>
  <Notice v-if="notes.length" tone="warning">
    <div class="flex items-center gap-2 font-medium">
      <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
      Imported from SHACL, with parts the builder cannot turn into inputs
    </div>

    <template v-if="noField.length">
      <p class="mt-1">No input field is generated for:</p>
      <ul class="mt-1 list-disc space-y-0.5 pl-4">
        <li v-for="note in noField" :key="note.message">
          {{ note.message }}
          <span v-if="scopeText(note)" class="opacity-75">({{ scopeText(note) }})</span>
        </li>
      </ul>
    </template>

    <p v-if="partial.length" class="mt-2">
      <button
        type="button"
        class="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
        :aria-expanded="detailsOpen"
        @click="detailsOpen = !detailsOpen"
      >
        <ChevronDown class="h-3 w-3 transition-transform" :class="detailsOpen ? 'rotate-180' : ''" />
        {{ partial.length }} {{ partial.length === 1 ? 'constraint' : 'constraints' }} kept a field, but not every detail
      </button>
    </p>
    <ul v-if="detailsOpen" class="mt-1 list-disc space-y-0.5 pl-4">
      <li v-for="note in partial" :key="note.message">
        {{ note.message }}
        <span v-if="scopeText(note)" class="opacity-75">({{ scopeText(note) }})</span>
      </li>
    </ul>

    <p class="mt-2 flex items-start gap-1.5">
      <FileCode2 class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span v-if="attached">
        The original constraints are included in the unified <code>shapes.ttl</code>, so everything above still runs when a dataset is validated, it just has no input of its own.
      </span>
      <span v-else>
        The original constraints are <b>not</b> included, so nothing above is checked. Upload the file under SHACL shapes (advanced) in the Basics step to include them.
      </span>
    </p>
  </Notice>
</template>
