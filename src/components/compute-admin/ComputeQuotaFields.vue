<script setup lang="ts">
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import { BYTE_UNITS } from '@/lib/computeAdmin'
import type { ByteInputDraft, ComputeQuotaDraft } from '@/lib/computeAdmin'

const props = defineProps<{ modelValue: ComputeQuotaDraft; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: ComputeQuotaDraft): void }>()

const unitOptions = BYTE_UNITS.map(({ value, label }) => ({ value, label }))

function updateScalar(
  field: 'max_jobs' | 'max_cpu_cores' | 'max_job_cpu_cores' | 'max_job_walltime_ms',
  value: string | number,
) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function updateBytes(
  field: 'max_ram_bytes' | 'max_disk_bytes' | 'max_job_ram_bytes' | 'max_job_disk_bytes',
  patch: Partial<ByteInputDraft>,
) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: { ...props.modelValue[field], ...patch },
  })
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <div>
      <label class="text-xs font-medium text-foreground">Max runs</label>
      <Input
        :model-value="modelValue.max_jobs"
        type="number"
        min="0"
        step="1"
        placeholder="Unbounded"
        class="mt-1"
        :disabled="disabled"
        @update:model-value="updateScalar('max_jobs', $event)"
      />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max CPU cores</label>
      <Input
        :model-value="modelValue.max_cpu_cores"
        type="number"
        min="0"
        step="1"
        placeholder="Unbounded"
        class="mt-1"
        :disabled="disabled"
        @update:model-value="updateScalar('max_cpu_cores', $event)"
      />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max RAM</label>
      <div class="mt-1 flex gap-2">
        <Input
          :model-value="modelValue.max_ram_bytes.value"
          type="number"
          min="0"
          placeholder="Unbounded"
          :disabled="disabled"
          @update:model-value="updateBytes('max_ram_bytes', { value: $event })"
        />
        <Select
          :model-value="modelValue.max_ram_bytes.unit"
          :options="unitOptions"
          class="w-24 shrink-0"
          aria-label="Max RAM unit"
          :disabled="disabled"
          @update:model-value="updateBytes('max_ram_bytes', { unit: $event })"
        />
      </div>
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max disk</label>
      <div class="mt-1 flex gap-2">
        <Input
          :model-value="modelValue.max_disk_bytes.value"
          type="number"
          min="0"
          placeholder="Unbounded"
          :disabled="disabled"
          @update:model-value="updateBytes('max_disk_bytes', { value: $event })"
        />
        <Select
          :model-value="modelValue.max_disk_bytes.unit"
          :options="unitOptions"
          class="w-24 shrink-0"
          aria-label="Max disk unit"
          :disabled="disabled"
          @update:model-value="updateBytes('max_disk_bytes', { unit: $event })"
        />
      </div>
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max run CPU cores</label>
      <Input
        :model-value="modelValue.max_job_cpu_cores"
        type="number"
        min="0"
        step="1"
        placeholder="Unbounded"
        class="mt-1"
        :disabled="disabled"
        @update:model-value="updateScalar('max_job_cpu_cores', $event)"
      />
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max run RAM</label>
      <div class="mt-1 flex gap-2">
        <Input
          :model-value="modelValue.max_job_ram_bytes.value"
          type="number"
          min="0"
          placeholder="Unbounded"
          :disabled="disabled"
          @update:model-value="updateBytes('max_job_ram_bytes', { value: $event })"
        />
        <Select
          :model-value="modelValue.max_job_ram_bytes.unit"
          :options="unitOptions"
          class="w-24 shrink-0"
          aria-label="Max run RAM unit"
          :disabled="disabled"
          @update:model-value="updateBytes('max_job_ram_bytes', { unit: $event })"
        />
      </div>
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max run disk</label>
      <div class="mt-1 flex gap-2">
        <Input
          :model-value="modelValue.max_job_disk_bytes.value"
          type="number"
          min="0"
          placeholder="Unbounded"
          :disabled="disabled"
          @update:model-value="updateBytes('max_job_disk_bytes', { value: $event })"
        />
        <Select
          :model-value="modelValue.max_job_disk_bytes.unit"
          :options="unitOptions"
          class="w-24 shrink-0"
          aria-label="Max run disk unit"
          :disabled="disabled"
          @update:model-value="updateBytes('max_job_disk_bytes', { unit: $event })"
        />
      </div>
    </div>
    <div>
      <label class="text-xs font-medium text-foreground">Max run walltime (ms)</label>
      <Input
        :model-value="modelValue.max_job_walltime_ms"
        type="number"
        min="0"
        step="1"
        placeholder="Unbounded"
        class="mt-1"
        :disabled="disabled"
        @update:model-value="updateScalar('max_job_walltime_ms', $event)"
      />
    </div>
  </div>
</template>
