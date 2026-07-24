<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { quoteCommand, tokenizeCommand } from '@/lib/shellwords'
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
  // One natural command line; tokenized shell-style into the argv on emit.
  commandLine: string
  workdir: string
  env: EnvRow[]
}

function fromModel(list: TesExecutor[]): ExecutorDraft {
  const executor = list[0] ?? { image: '', command: [] }
  return {
    image: executor.image ?? '',
    commandLine: quoteCommand(executor.command ?? []),
    workdir: executor.workdir ?? '',
    env: Object.entries(executor.env ?? {}).map(([key, value]) => ({ key, value })),
  }
}

function toModel(draft: ExecutorDraft): TesExecutor[] {
  const parsed = tokenizeCommand(draft.commandLine)
  // A tokenization error emits an empty argv, which the wizard's validity
  // check treats as an incomplete executor.
  const executor: TesExecutor = { image: draft.image, command: parsed.error ? [] : parsed.argv }
  if (draft.workdir.trim()) executor.workdir = draft.workdir
  const env: Record<string, string> = {}
  for (const row of draft.env) if (row.key.trim()) env[row.key.trim()] = row.value
  if (Object.keys(env).length) executor.env = env
  return [executor]
}

const executor = ref<ExecutorDraft>(fromModel(props.modelValue))
watch(executor, (value) => emit('update:modelValue', toModel(value)), { deep: true })

const commandTokens = computed(() => tokenizeCommand(executor.value.commandLine))

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
      <Input
        v-model="executor.commandLine"
        class="mt-1 font-mono"
        placeholder='python train.py --epochs 5 "my file.csv"'
        :disabled="disabled"
        :invalid="commandTokens.error ? 'error' : undefined"
        aria-label="Command line"
      />
      <p v-if="commandTokens.error" class="mt-1 text-[11px] text-destructive">{{ commandTokens.error }}</p>
      <div v-else-if="commandTokens.argv.length" class="mt-1.5 flex flex-wrap items-center gap-1">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground">argv</span>
        <Badge v-for="(arg, index) in commandTokens.argv" :key="`${index}-${arg}`" variant="outline" class="max-w-60 font-mono text-[10px]">
          <span class="truncate">{{ arg }}</span>
        </Badge>
      </div>
      <p class="mt-1 text-[11px] text-muted-foreground">
        Executed as this argument list without a shell: quote arguments that contain spaces ("my file.csv"); there is no variable expansion, globbing or piping.
      </p>
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
