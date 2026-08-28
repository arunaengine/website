<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Button from '@/components/ui/Button.vue'
import { Plus, Trash2 } from '@lucide/vue'
import { trimmed, type DraftPropertyRule } from '../useProfileBuilder'

const props = defineProps<{
  property: DraftPropertyRule
  disabled: boolean
}>()

const MATCH_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'id', label: '@id' },
]

function addRequiredInstance() {
  props.property.requiredInstances.push({ match: 'name', value: '', hint: '' })
}

function removeRequiredInstance(index: number) {
  props.property.requiredInstances.splice(index, 1)
}
</script>

<template>
  <div class="rounded-md border border-border px-3 py-2">
    <div class="text-[11px] font-medium text-foreground">Required contents</div>
    <p class="text-[11px] text-muted-foreground">
      Checked against the dataset's data references; more files are always allowed.
    </p>
    <p class="mt-0.5 text-[11px] text-muted-foreground">
      Match by <b>Name</b> against the entry's label / filename (e.g. <code class="rounded bg-muted px-1">index.html</code>). Match by <b>@id</b> only against its exact reference URL, data references are absolute URLs, so a bare filename never matches.
    </p>
    <div v-for="(row, index) in property.requiredInstances" :key="index" class="mt-1.5 space-y-1">
      <div class="flex flex-wrap items-center gap-1.5">
        <Select v-model="row.match" :options="MATCH_OPTIONS" class="w-[92px] shrink-0" :disabled="disabled" />
        <Input v-model="row.value" class="min-w-[140px] flex-1" :placeholder="row.match === 'id' ? 'https://example.org/data/index.html' : 'index.html'" :disabled="disabled" :invalid="!trimmed(row.value) ? 'error' : undefined" />
        <button
          v-if="!disabled"
          type="button"
          class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          @click="removeRequiredInstance(index)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
      <Input v-model="row.hint" class="text-[11px]" placeholder="Optional hint shown to users" :disabled="disabled" />
    </div>
    <Button v-if="!disabled" type="button" variant="outline" size="sm" class="mt-1.5" @click="addRequiredInstance">
      <Plus class="h-3 w-3" /> Add required item
    </Button>
  </div>
</template>
