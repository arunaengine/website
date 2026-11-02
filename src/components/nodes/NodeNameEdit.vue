<script setup lang="ts">
// A node's name with a rename control: Save stores the typed name, an empty one resets it to the
// node's own. The slot shows the name while nobody edits it.
import { ref } from 'vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import Input from '@/components/ui/Input.vue'
import { apiErrorMessage } from '@/lib/api'
import { Pencil } from '@lucide/vue'

const props = defineProps<{
  /** What the control names, for its label ("Rename node-2"). */
  name: string
  /** The display name the realm stores now; null when unset. */
  value?: string | null
  save: (name: string | null) => Promise<void>
  /** Shows the Pencil in the muted text color. */
  quiet?: boolean
  /** An outline icon button, as it stands among the page header's buttons. */
  outline?: boolean
}>()

const editing = ref(false)
const draft = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

function start() {
  draft.value = props.value ?? ''
  error.value = null
  editing.value = true
}

async function submit() {
  busy.value = true
  error.value = null
  try {
    await props.save(draft.value.trim() || null)
    editing.value = false
  } catch (cause) {
    error.value = apiErrorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form v-if="editing" class="flex min-w-0 flex-wrap items-center gap-1.5" @submit.prevent="submit">
    <Input v-model="draft" :aria-label="`New name for ${name}`" placeholder="Empty resets the name" maxlength="64" class="h-8 w-44 text-xs" />
    <Button type="submit" size="sm" :disabled="busy">Save</Button>
    <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="editing = false">Cancel</Button>
    <p v-if="error" role="alert" class="basis-full text-xs text-destructive">{{ error }}</p>
  </form>
  <span v-else class="inline-flex min-w-0 items-center gap-0.5">
    <slot />
    <IconButton
      :label="`Rename ${name}`"
      :variant="outline ? 'outline' : undefined"
      :class="quiet ? 'text-muted-foreground' : undefined"
      @click="start"
    >
      <Pencil :class="outline ? 'size-4' : 'h-3 w-3'" />
    </IconButton>
  </span>
</template>
