<script setup lang="ts">
// A centered confirmation for one irreversible action. With `typed`, the action
// stays disabled until the user types that exact text.
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Notice from '@/components/ui/Notice.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  busy?: boolean
  error?: string | null
  typed?: string
  blocked?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'confirm'): void
}>()

const answer = ref('')
watch(() => props.open, () => (answer.value = ''))

const ready = computed(() => !props.busy && !props.blocked && (!props.typed || answer.value === props.typed))
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>{{ props.title }}</DialogTitle>
        <DialogDescription v-if="props.description">{{ props.description }}</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <slot />
        <div v-if="props.typed" class="space-y-1.5">
          <label class="text-xs font-medium text-foreground" for="confirm-typed">
            Type <span class="font-mono">{{ props.typed }}</span> to confirm
          </label>
          <Input id="confirm-typed" v-model="answer" autocomplete="off" />
        </div>
        <Notice v-if="props.error" tone="error">{{ props.error }}</Notice>
      </div>

      <DialogFooter>
        <DialogClose as-child><Button variant="outline">Cancel</Button></DialogClose>
        <Button variant="destructive" :disabled="!ready" @click="emit('confirm')">
          <Spinner v-if="props.busy" :label="props.confirmLabel" class="text-current" /> {{ props.confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
