<script setup lang="ts">
import { ref, watch } from 'vue'
import ExternalLink from '@/components/ui/ExternalLink.vue'
import type { PresentedField, PresentedValue } from '@/lib/cratePresenter'

// Aligned label/value ledger for presented fields. Every row carries its
// machine term as a mono token; hrefs render only through ExternalLink.
const props = defineProps<{ fields: PresentedField[] }>()
const emit = defineEmits<{ (e: 'jump', id: string): void }>()

const expanded = ref<Record<string, boolean>>({})
watch(
  () => props.fields,
  () => (expanded.value = {}),
)

function chips(field: PresentedField): boolean {
  return field.values.length > 1 && field.values.every((value) => !value.long)
}

function plainTitle(value: PresentedValue): string | undefined {
  return value.title && value.title !== value.text ? value.title : undefined
}
</script>

<template>
  <dl class="text-sm">
    <div
      v-for="field in fields"
      :key="field.key + field.label"
      class="mb-3 last:mb-0 sm:mb-0 sm:grid sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] sm:gap-x-6 sm:border-b sm:border-border/50 sm:py-2 sm:last:border-b-0"
    >
      <dt class="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 sm:mb-0 sm:pt-px" :title="field.description">
        <span
          class="text-[11px] font-medium uppercase tracking-wider"
          :class="field.profiled ? 'text-foreground/80' : 'text-muted-foreground'"
        >{{ field.label }}</span>
        <span v-if="field.key.toLowerCase() !== field.label.toLowerCase()" class="font-mono text-[10px] text-muted-foreground/60">{{ field.key }}</span>
      </dt>
      <dd class="min-w-0">
        <div v-if="chips(field)" class="flex flex-wrap gap-1.5">
          <template v-for="(value, i) in field.values" :key="i">
            <button
              v-if="value.jumpId"
              type="button"
              class="chip text-primary hover:border-primary/40"
              :title="plainTitle(value)"
              @click="emit('jump', value.jumpId)"
            >{{ value.text }}</button>
            <ExternalLink v-else-if="value.href" :href="value.href" :label="value.text" class="chip text-primary" :title="plainTitle(value)" />
            <span v-else class="chip text-foreground/80" :title="plainTitle(value)">{{ value.text }}</span>
          </template>
        </div>
        <template v-else>
          <div v-for="(value, i) in field.values" :key="i" class="min-w-0">
            <button
              v-if="value.jumpId"
              type="button"
              class="max-w-full truncate text-left text-primary hover:underline"
              :title="plainTitle(value)"
              @click="emit('jump', value.jumpId)"
            >{{ value.text }}</button>
            <ExternalLink v-else-if="value.href" :href="value.href" :label="value.text" class="max-w-full truncate" :title="plainTitle(value)" />
            <template v-else-if="value.long">
              <p class="whitespace-pre-wrap leading-relaxed text-foreground/85" :class="expanded[field.key + i] ? '' : 'line-clamp-3'">{{ value.text }}</p>
              <button
                type="button"
                class="mt-0.5 text-xs font-medium text-primary hover:underline"
                @click="expanded = { ...expanded, [field.key + i]: !expanded[field.key + i] }"
              >{{ expanded[field.key + i] ? 'Show less' : 'Show more' }}</button>
            </template>
            <span v-else class="break-words text-foreground/90" :title="plainTitle(value)">{{ value.text }}</span>
          </div>
        </template>
      </dd>
    </div>
  </dl>
</template>
