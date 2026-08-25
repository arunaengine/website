<script setup lang="ts">
// Two places a run can happen, as two plain choices. Only Aruna Desktop ever
// shows it, and only while this machine can actually run something.
import { computed, nextTick } from 'vue'
import type { DeviceCompute } from '@/lib/deviceApi'
import type { RunTarget } from '@/composables/useRunTarget'
import { Cloud, Laptop } from '@lucide/vue'

const props = defineProps<{ modelValue: RunTarget; compute?: DeviceCompute | null; realmName: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: RunTarget): void }>()

const localHint = computed(() => {
  const backend = props.compute?.backend
  const running = props.compute?.running ?? 0
  return backend ? `${backend}${running ? ` · ${running} running` : ''}` : 'this machine'
})

const options = computed(() => [
  { value: 'local' as const, label: 'This computer', hint: localHint.value, icon: Laptop },
  { value: 'realm' as const, label: props.realmName, hint: 'shared compute', icon: Cloud },
])

// Radio-group keyboard behaviour: one tab stop, arrows move the choice and
// take the focus with them.
const buttons: HTMLButtonElement[] = []
function keepButton(el: Element | null, index: number): void {
  if (el) buttons[index] = el as HTMLButtonElement
}

function move(step: number): void {
  const values = options.value.map((option) => option.value)
  const index = (values.indexOf(props.modelValue) + step + values.length) % values.length
  const next = values[index]
  if (!next || next === props.modelValue) return
  emit('update:modelValue', next)
  void nextTick(() => buttons[index]?.focus())
}
</script>

<template>
  <div>
    <span class="text-xs font-medium text-foreground">Run on</span>
    <div class="mt-1.5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Where the run executes">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        :ref="(el) => keepButton(el as Element | null, index)"
        type="button"
        role="radio"
        :aria-checked="props.modelValue === option.value"
        :tabindex="props.modelValue === option.value ? 0 : -1"
        :class="[
          'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
          props.modelValue === option.value
            ? 'border-primary/50 bg-primary/[0.08]'
            : 'border-border hover:bg-muted/50',
        ]"
        @click="emit('update:modelValue', option.value)"
        @keydown.right.prevent="move(1)"
        @keydown.down.prevent="move(1)"
        @keydown.left.prevent="move(-1)"
        @keydown.up.prevent="move(-1)"
      >
        <component :is="option.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block truncate text-[13px] font-medium text-foreground">{{ option.label }}</span>
          <span class="block truncate text-[11px] text-muted-foreground">{{ option.hint }}</span>
        </span>
      </button>
    </div>
    <p v-if="props.modelValue === 'local'" class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
      Inputs that live in the realm are copied to this computer before the run starts, and the results stay here until
      you publish them.
    </p>
  </div>
</template>
