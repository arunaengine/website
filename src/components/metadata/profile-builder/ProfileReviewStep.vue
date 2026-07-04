<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import Select from '@/components/ui/Select.vue'
import Switch from '@/components/ui/Switch.vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import { CheckCircle2, AlertTriangle } from '@lucide/vue'
import { controlsFromSchema, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { validateProfileData } from '@/lib/profiles/validate'
import { PROFILE_OBLIGATION_LABELS } from '@/lib/profiles/labels'
import type { ProfileBuilder } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// The preview compiles the generated schema through the same controls pipeline
// dataset creation uses, so authors see exactly what people filling the profile
// will see and how validation reacts.
const controls = computed(() => controlsFromSchema(builder.generatedSchema))
const values = ref<Record<string, unknown>>({})
watch(controls, (list) => { values.value = defaultControlValues(list) }, { immediate: true })

const normalizedValues = computed(() => normalizeProfileValues(values.value, controls.value))
const violations = computed(() => validateProfileData(builder.generatedSchema, normalizedValues.value))

function fieldString(property: string): string {
  const value = values.value[property]
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
}

function setValue(property: string, value: unknown) {
  values.value = { ...values.value, [property]: value }
}

function violationsFor(property: string) {
  return violations.value.filter((violation) => violation.fieldId === property)
}
</script>

<template>
  <section class="space-y-4">
    <!-- Validation summary -->
    <div v-if="builder.allErrors.length" class="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <div class="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle class="h-4 w-4" /> {{ builder.allErrors.length }} {{ builder.allErrors.length === 1 ? 'issue' : 'issues' }} to fix before creating
      </div>
      <ul class="mt-2 space-y-1 text-xs text-destructive">
        <li v-for="error in builder.allErrors" :key="error">{{ error }}</li>
      </ul>
    </div>
    <div v-else class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 class="h-4 w-4" /> This profile is ready to create.
    </div>

    <p class="text-xs text-muted-foreground">
      The JSON Schema and Profile Crate below are derived artifacts — the entity and property rules are the source of truth.
    </p>

    <Tabs default-value="preview">
      <TabsList>
        <TabsTrigger value="preview">Form preview</TabsTrigger>
        <TabsTrigger value="schema">JSON Schema</TabsTrigger>
        <TabsTrigger value="crate">Profile Crate</TabsTrigger>
      </TabsList>

      <TabsContent value="preview">
        <div class="rounded-lg border border-border p-4">
          <p class="text-xs text-muted-foreground">
            This is the form people see when they create a Dataset with this profile. Try it out —
            required (MUST) values that are empty show an error, recommended (SHOULD) values show an amber warning.
          </p>
          <div v-if="!controls.length" class="mt-3 text-xs text-muted-foreground">
            The Dataset entity has no property rules yet, so no inputs are generated.
          </div>
          <div v-else class="mt-3 grid gap-3 sm:grid-cols-2">
            <div v-for="control in controls" :key="control.property" :class="control.control === 'textarea' || control.control === 'tags' ? 'sm:col-span-2' : ''">
              <label class="flex items-center gap-2 text-xs font-medium text-foreground">
                {{ control.label }}
                <Badge v-if="control.obligation" :variant="control.obligation === 'MUST' ? 'royal' : control.obligation === 'SHOULD' ? 'warn' : 'secondary'" class="text-[10px]">
                  {{ control.obligation ? PROFILE_OBLIGATION_LABELS[control.obligation].label : '' }}
                </Badge>
              </label>
              <Textarea
                v-if="control.control === 'textarea'"
                :model-value="fieldString(control.property)"
                class="mt-1"
                rows="3"
                @update:model-value="(value: string) => setValue(control.property, value)"
              />
              <Select
                v-else-if="control.control === 'select'"
                :model-value="fieldString(control.property)"
                :options="(control.enumOptions ?? []).map((option) => ({ value: option, label: option }))"
                class="mt-1"
                placeholder="Choose an option"
                @update:model-value="(value: string) => setValue(control.property, value)"
              />
              <label v-else-if="control.control === 'checkbox'" class="mt-1 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                <span>{{ control.description || 'Enabled' }}</span>
                <Switch :checked="Boolean(values[control.property])" @update:checked="(value: boolean) => setValue(control.property, value)" />
              </label>
              <Input
                v-else
                :model-value="fieldString(control.property)"
                :type="control.control === 'integer' || control.control === 'number' ? 'number' : control.control === 'datetime-local' ? 'datetime-local' : control.control === 'tags' ? 'text' : control.control"
                class="mt-1"
                :placeholder="control.control === 'tags' ? 'Comma-separated values' : undefined"
                @update:model-value="(value: string | number) => setValue(control.property, value)"
              />
              <p v-if="control.description && control.control !== 'checkbox'" class="mt-1 text-[11px] text-muted-foreground">{{ control.description }}</p>
              <p
                v-for="violation in violationsFor(control.property)"
                :key="violation.ruleId + violation.pointer"
                class="mt-1 text-[11px]"
                :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'"
              >
                {{ violation.message }}
              </p>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="schema">
        <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ builder.generatedSchemaText }}</pre>
      </TabsContent>

      <TabsContent value="crate">
        <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ builder.generatedCrateText }}</pre>
      </TabsContent>
    </Tabs>
  </section>
</template>
