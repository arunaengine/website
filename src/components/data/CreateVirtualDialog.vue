<script setup lang="ts">
import Dialog from '@/components/ui/Dialog.vue'
import DialogContent from '@/components/ui/DialogContent.vue'
import DialogHeader from '@/components/ui/DialogHeader.vue'
import DialogTitle from '@/components/ui/DialogTitle.vue'
import DialogDescription from '@/components/ui/DialogDescription.vue'
import DialogFooter from '@/components/ui/DialogFooter.vue'
import DialogClose from '@/components/ui/DialogClose.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { Boxes, Globe, Lock, Users } from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', payload: { name: string; visibility: Visibility }): void
}>()

type Visibility = 'public' | 'internal' | 'private'

const name = ref('')
const description = ref('')
const visibility = ref<Visibility>('internal')

const visibilityOptions: { id: Visibility; title: string; description: string; icon: unknown }[] = [
  {
    id: 'public',
    title: 'Public',
    description: 'Anyone can find and read this bucket.',
    icon: Globe,
  },
  {
    id: 'internal',
    title: 'Internal',
    description: 'Members of your realm can read this bucket.',
    icon: Users,
  },
  {
    id: 'private',
    title: 'Private',
    description: 'Only people you explicitly invite can read.',
    icon: Lock,
  },
]

function submit() {
  emit('created', { name: name.value, visibility: visibility.value })
  emit('update:open', false)
  name.value = ''
  description.value = ''
}
</script>

<template>
  <Dialog :open="props.open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Boxes class="h-4 w-4 text-primary" /> New bucket
        </DialogTitle>
        <DialogDescription>
          A bucket holds related files and the metadata that describes them.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <label class="text-xs font-medium text-foreground">Name</label>
          <Input v-model="name" placeholder="my-cohort" class="mt-1" />
          <p class="mt-1 text-[11px] text-muted-foreground">
            Lowercase, hyphens or numbers. Must be unique inside your group.
          </p>
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Short description</label>
          <Textarea
            v-model="description"
            rows="2"
            placeholder="What goes inside this bucket?"
            class="mt-1"
          />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Visibility</label>
          <div class="mt-2 grid gap-2">
            <button
              v-for="opt in visibilityOptions"
              :key="opt.id"
              type="button"
              class="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
              :class="visibility === opt.id ? 'border-primary/60 ring-1 ring-primary/30' : ''"
              @click="visibility = opt.id"
            >
              <component
                :is="opt.icon"
                class="mt-0.5 h-4 w-4 shrink-0 text-primary"
              />
              <div>
                <div class="text-sm font-medium text-foreground">{{ opt.title }}</div>
                <div class="text-[11px] text-muted-foreground">
                  {{ opt.description }}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button :disabled="!name" @click="submit">Create bucket</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
