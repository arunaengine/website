<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import type { TesExecutor } from '@/lib/tes'
import { Plus, Terminal, X } from '@lucide/vue'

const props = defineProps<{ modelValue: TesExecutor[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: TesExecutor[]): void }>()

interface EnvRow {
  key: string
  value: string
}

interface ExecutorDraft {
  image: string
  command: string[]
  workdir: string
  env: EnvRow[]
}

function fromModel(list: TesExecutor[]): ExecutorDraft {
  const executor = list[0] ?? { image: '', command: [''] }
  return {
    image: executor.image ?? '',
    command: executor.command?.length ? [...executor.command] : [''],
    workdir: executor.workdir ?? '',
    env: Object.entries(executor.env ?? {}).map(([key, value]) => ({ key, value })),
  }
}

function toModel(draft: ExecutorDraft): TesExecutor[] {
  const executor: TesExecutor = { image: draft.image, command: [...draft.command] }
  if (draft.workdir.trim()) executor.workdir = draft.workdir
  const env: Record<string, string> = {}
  for (const row of draft.env) if (row.key.trim()) env[row.key.trim()] = row.value
  if (Object.keys(env).length) executor.env = env
  return [executor]
}

const executor = ref<ExecutorDraft>(fromModel(props.modelValue))
watch(executor, (value) => emit('update:modelValue', toModel(value)), { deep: true })

function addArg() {
  executor.value.command.push('')
}

function removeArg(index: number) {
  executor.value.command.splice(index, 1)
  if (!executor.value.command.length) executor.value.command.push('')
}

function addEnv() {
  executor.value.env.push({ key: '', value: '' })
}

function removeEnv(index: number) {
  executor.value.env.splice(index, 1)
}
</script>

<template>
  <div class="surface-inline space-y-4 p-4">
    <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Terminal class="h-4 w-4 text-primary" /> Executor
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">Image</label>
      <Input v-model="executor.image" class="mt-1 font-mono" placeholder="ubuntu:22.04" :disabled="disabled" />
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">Command</label>
      <div class="mt-1 space-y-1.5">
        <div v-for="(_, index) in executor.command" :key="index" class="flex items-center gap-2">
          <Input
            v-model="executor.command[index]"
            class="font-mono"
            :placeholder="index === 0 ? 'echo' : 'argument'"
            :disabled="disabled"
          />
          <Button variant="ghost" size="icon-sm" :disabled="disabled" aria-label="Remove argument" @click="removeArg(index)">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="sm" class="mt-1.5" :disabled="disabled" @click="addArg">
        <Plus class="size-3.5" /> Add argument
      </Button>
      <p class="mt-1 text-[11px] text-muted-foreground">Executed as an argv array without a shell.</p>
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">Working directory <span class="text-muted-foreground">(optional)</span></label>
      <Input v-model="executor.workdir" class="mt-1 font-mono" placeholder="/work" :disabled="disabled" />
    </div>

    <div>
      <label class="text-xs font-medium text-foreground">Environment <span class="text-muted-foreground">(optional)</span></label>
      <div v-if="executor.env.length" class="mt-1 space-y-1.5">
        <div v-for="(row, index) in executor.env" :key="index" class="flex items-center gap-2">
          <Input v-model="row.key" class="font-mono" placeholder="NAME" :disabled="disabled" />
          <Input v-model="row.value" class="font-mono" placeholder="value" :disabled="disabled" />
          <Button variant="ghost" size="icon-sm" :disabled="disabled" aria-label="Remove variable" @click="removeEnv(index)">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="sm" class="mt-1.5" :disabled="disabled" @click="addEnv">
        <Plus class="size-3.5" /> Add variable
      </Button>
    </div>

    <p class="text-[11px] text-muted-foreground">The current Aruna TES facade accepts exactly one executor per task.</p>
  </div>
</template>
