<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import type { TesExecutor } from '@/lib/tes'
import { ArrowDown, ArrowUp, ListPlus, Plus, Terminal, Trash2, X } from '@lucide/vue'

// The core step UI (aruna#290): an ordered, editable list of executor step
// cards. It owns a local draft (initialised once from modelValue) so nested
// fields — including the env key/value rows — edit smoothly; it never mutates
// the prop and emits a fresh normalized TesExecutor[] on every change. The
// wizard is the sole owner of the executor list, so one-way init is sufficient.
const props = defineProps<{ modelValue: TesExecutor[]; disabled?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: TesExecutor[]): void }>()

interface EnvRow {
  key: string
  value: string
}
interface StepDraft {
  image: string
  command: string[]
  workdir: string
  stdout: string
  stderr: string
  env: EnvRow[]
  ignoreError: boolean
}

function fromModel(list: TesExecutor[]): StepDraft[] {
  const src = list.length ? list : [{ image: '', command: [''] }]
  return src.map((e) => ({
    image: e.image ?? '',
    command: e.command?.length ? [...e.command] : [''],
    workdir: e.workdir ?? '',
    stdout: e.stdout ?? '',
    stderr: e.stderr ?? '',
    env: Object.entries(e.env ?? {}).map(([key, value]) => ({ key, value })),
    ignoreError: e.ignore_error ?? false,
  }))
}

function toModel(list: StepDraft[]): TesExecutor[] {
  return list.map((s) => {
    const executor: TesExecutor = { image: s.image, command: [...s.command] }
    if (s.workdir.trim()) executor.workdir = s.workdir
    if (s.stdout.trim()) executor.stdout = s.stdout
    if (s.stderr.trim()) executor.stderr = s.stderr
    const env: Record<string, string> = {}
    for (const row of s.env) if (row.key.trim()) env[row.key.trim()] = row.value
    if (Object.keys(env).length) executor.env = env
    if (s.ignoreError) executor.ignore_error = true
    return executor
  })
}

const steps = ref<StepDraft[]>(fromModel(props.modelValue))
watch(steps, (v) => emit('update:modelValue', toModel(v)), { deep: true })

function addStep() {
  steps.value = [...steps.value, { image: '', command: [''], workdir: '', stdout: '', stderr: '', env: [], ignoreError: false }]
}
function removeStep(i: number) {
  if (steps.value.length <= 1) return
  steps.value = steps.value.filter((_, idx) => idx !== i)
}
function moveStep(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= steps.value.length) return
  const next = [...steps.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  steps.value = next
}
function addArg(step: StepDraft) {
  step.command.push('')
}
function removeArg(step: StepDraft, argIndex: number) {
  step.command.splice(argIndex, 1)
  if (!step.command.length) step.command.push('')
}
function addEnv(step: StepDraft) {
  step.env.push({ key: '', value: '' })
}
function removeEnv(step: StepDraft, envIndex: number) {
  step.env.splice(envIndex, 1)
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="(step, i) in steps" :key="i" class="surface space-y-4 p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Terminal class="h-4 w-4 text-primary" /> Step {{ i + 1 }}
        </div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" :disabled="disabled || i === 0" aria-label="Move step up" @click="moveStep(i, -1)">
            <ArrowUp class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" :disabled="disabled || i === steps.length - 1" aria-label="Move step down" @click="moveStep(i, 1)">
            <ArrowDown class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" :disabled="disabled || steps.length <= 1" aria-label="Remove step" @click="removeStep(i)">
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Image -->
      <div>
        <label class="text-xs font-medium text-foreground">Image</label>
        <Input v-model="step.image" class="mt-1 font-mono" placeholder="ubuntu:22.04" :disabled="disabled" />
      </div>

      <!-- Command (argv) -->
      <div>
        <label class="text-xs font-medium text-foreground">Command</label>
        <div class="mt-1 space-y-1.5">
          <div v-for="(_, argIndex) in step.command" :key="argIndex" class="flex items-center gap-2">
            <Input v-model="step.command[argIndex]" class="font-mono" :placeholder="argIndex === 0 ? 'echo' : 'argument'" :disabled="disabled" />
            <Button variant="ghost" size="icon-sm" :disabled="disabled" aria-label="Remove argument" @click="removeArg(step, argIndex)">
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="mt-1.5" :disabled="disabled" @click="addArg(step)"><Plus class="size-3.5" /> Add argument</Button>
        <p class="mt-1 text-[11px] text-muted-foreground">Executed as an argv array — no shell; wrap in <code class="rounded bg-muted px-1">sh -c '…'</code> yourself if you need one.</p>
      </div>

      <!-- Workdir -->
      <div>
        <label class="text-xs font-medium text-foreground">Working directory <span class="text-muted-foreground">(optional)</span></label>
        <Input v-model="step.workdir" class="mt-1 font-mono" placeholder="/data" :disabled="disabled" />
      </div>

      <!-- Environment -->
      <div>
        <label class="text-xs font-medium text-foreground">Environment <span class="text-muted-foreground">(optional)</span></label>
        <div v-if="step.env.length" class="mt-1 space-y-1.5">
          <div v-for="(row, envIndex) in step.env" :key="envIndex" class="flex items-center gap-2">
            <Input v-model="row.key" class="font-mono" placeholder="NAME" :disabled="disabled" />
            <Input v-model="row.value" class="font-mono" placeholder="value" :disabled="disabled" />
            <Button variant="ghost" size="icon-sm" :disabled="disabled" aria-label="Remove variable" @click="removeEnv(step, envIndex)">
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="mt-1.5" :disabled="disabled" @click="addEnv(step)"><Plus class="size-3.5" /> Add variable</Button>
      </div>

      <!-- Stdout / stderr -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="text-xs font-medium text-foreground">Stdout path <span class="text-muted-foreground">(optional)</span></label>
          <Input v-model="step.stdout" class="mt-1 font-mono" placeholder="/logs/stdout.log" :disabled="disabled" />
        </div>
        <div>
          <label class="text-xs font-medium text-foreground">Stderr path <span class="text-muted-foreground">(optional)</span></label>
          <Input v-model="step.stderr" class="mt-1 font-mono" placeholder="/logs/stderr.log" :disabled="disabled" />
        </div>
      </div>
      <p class="text-[11px] text-muted-foreground">Absolute container paths; captured into the task log when set.</p>

      <!-- Continue on error -->
      <label class="flex items-center gap-2 text-xs font-medium text-foreground">
        <Switch v-model:checked="step.ignoreError" :disabled="disabled" /> Continue on error
      </label>
    </div>

    <Button variant="outline" size="sm" :disabled="disabled" @click="addStep"><ListPlus class="size-3.5" /> Add step</Button>
  </div>
</template>
