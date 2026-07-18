<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from '@/components/ui/Badge.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import { CheckCircle2, AlertTriangle, Lightbulb } from '@lucide/vue'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { entityRulesToMode } from '@/lib/profiles/mode'
import { parseProfileCrate } from '@/lib/profiles/rocrate'
import { validateProfileData } from '@/lib/profiles/validate'
import { obligationBadgeVariant, PROFILE_OBLIGATION_LABELS, PROFILE_REFERENCE_MODE_LABELS } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import type { ProfileBuilder } from './useProfileBuilder'

const props = defineProps<{ builder: ProfileBuilder }>()
const builder = props.builder

// Plain-English lines for every constraint the schema/mode preview cannot show at
// a glance: allowed URL sets, list cardinality, reference mode, required contents.
// Only rules that carry at least one such constraint appear, so a plain profile
// shows an empty summary (hidden).
function constraintLines(rule: ProfilePropertyRule): string[] {
  const lines: string[] = []
  if (rule.kind === 'select-url' && rule.valueOptions?.length) {
    lines.push(`Value must be one of ${rule.valueOptions.length} allowed URLs: ${(rule.valueOptions as string[]).join(', ')}.`)
  }
  if (rule.minItems !== undefined && rule.maxItems !== undefined) {
    lines.push(`Must have between ${rule.minItems} and ${rule.maxItems} entries.`)
  } else if (rule.minItems !== undefined) {
    lines.push(`Must have at least ${rule.minItems} ${rule.minItems === 1 ? 'entry' : 'entries'}.`)
  } else if (rule.maxItems !== undefined) {
    lines.push(`Must have at most ${rule.maxItems} ${rule.maxItems === 1 ? 'entry' : 'entries'}.`)
  }
  if (rule.referenceMode) {
    lines.push(`Referenced as: ${PROFILE_REFERENCE_MODE_LABELS[rule.referenceMode].label}.`)
  }
  for (const instance of rule.requiredInstances ?? []) {
    const match = instance.id !== undefined ? `@id ${instance.id}` : `name ${instance.name}`
    lines.push(`Must contain an entry matching ${match}${instance.hint ? `, ${instance.hint}` : ''}.`)
  }
  return lines
}

const constraintSummary = computed(() =>
  builder.normalizedEntities
    .map((entity) => ({
      label: entity.label,
      rules: entity.propertyRules
        .map((rule) => ({ label: rule.label || rule.valueName, obligation: rule.obligation, lines: constraintLines(rule) }))
        .filter((rule) => rule.lines.length),
    }))
    .filter((entity) => entity.rules.length),
)

// Preview honesty: the form preview is built from the ROUND-TRIPPED parse —
// the emitted crate (buildProfileCrate) parsed back the way the dataset dialog
// will parse it — not from the in-memory rules. The round-trip is lossy by
// design in documented spots (e.g. a text rule with multiple values flattens to
// a keyword list); the preview showing that loss is the point.
const roundTrip = computed<{ parsed: ReturnType<typeof parseProfileCrate> | null; error: string | null }>(() => {
  try {
    return { parsed: parseProfileCrate(builder.generatedCrate), error: null }
  } catch (err) {
    return { parsed: null, error: err instanceof Error ? err.message : String(err) }
  }
})
const controls = computed(() => {
  const parsed = roundTrip.value.parsed
  if (!parsed) return controlsFromRules(builder.datasetEntity?.propertyRules ?? [], builder.normalizedEntities)
  return controlsFromRules(parsed.datasetPropertyRules, parsed.entityRules)
})
// Validate against the round-tripped schema too, so warnings match the real form.
const previewSchema = computed(() => roundTrip.value.parsed?.schema ?? builder.generatedSchema)
const values = ref<Record<string, unknown>>({})
watch(controls, (list) => { values.value = defaultControlValues(list) }, { immediate: true })

// Pretty-printed Describo/Crate-O mode file — the canonical machine-readable rule
// serialization, including any verbatim-preserved keys from an imported mode.
const modeText = computed(() =>
  JSON.stringify(
    entityRulesToMode(builder.profileBasics(), builder.normalizedEntities, builder.importedMode ?? undefined),
    null,
    2,
  ),
)

const normalizedValues = computed(() => normalizeProfileValues(values.value, controls.value))
const violations = computed(() => validateProfileData(previewSchema.value, normalizedValues.value))

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

    <!-- Non-blocking authoring suggestions (e.g. prefer a schema.org term). -->
    <div v-if="builder.rulesHints.length" class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div class="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <Lightbulb class="h-4 w-4" /> Suggestions
      </div>
      <ul class="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
        <li v-for="hint in builder.rulesHints" :key="hint">{{ hint }}</li>
      </ul>
    </div>

    <!-- Human summary of the constraints the raw artifacts express tersely:
         allowed URL sets, list cardinality, reference mode, required contents. -->
    <div v-if="constraintSummary.length" class="rounded-lg border border-border p-3">
      <div class="text-sm font-medium text-foreground">Constraints</div>
      <div v-for="entity in constraintSummary" :key="entity.label" class="mt-2">
        <div class="text-xs font-medium text-muted-foreground">{{ entity.label }}</div>
        <ul class="mt-1 space-y-1">
          <li v-for="rule in entity.rules" :key="rule.label" class="text-[11px] text-foreground">
            <span class="inline-flex items-center gap-1.5">
              <Badge :variant="obligationBadgeVariant(rule.obligation)" class="text-[10px]">{{ PROFILE_OBLIGATION_LABELS[rule.obligation].label }}</Badge>
              <span class="font-medium">{{ rule.label }}</span>
            </span>
            <ul class="ml-4 list-disc space-y-0.5 text-muted-foreground">
              <li v-for="line in rule.lines" :key="line">{{ line }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>

    <!-- What each generated artifact is for (D6). The entity and property rules
         are the source of truth; these three files are derived from them. -->
    <p class="text-xs text-muted-foreground">
      Your rules generate three files:
      <b class="text-foreground">profile.html</b> is the human-readable specification,
      <b class="text-foreground">mode.json</b> is the editor form structure (Describo/Crate-O-compatible), and
      <b class="text-foreground">schema.json</b> holds the validation rules. They all travel together in the Profile Crate.
      Editors read the mode file; validation reads the validation rules, mode files have no vocabulary for constraints or recommended levels.
    </p>

    <Tabs default-value="preview">
      <TabsList>
        <TabsTrigger value="preview">Form preview</TabsTrigger>
        <TabsTrigger value="schema">Validation rules</TabsTrigger>
        <TabsTrigger value="mode">Mode file</TabsTrigger>
        <TabsTrigger value="crate">Profile Crate</TabsTrigger>
      </TabsList>

      <TabsContent value="preview">
        <div class="rounded-lg border border-border p-4">
          <p class="text-xs text-muted-foreground">
            A read-only preview of the form people see when they create a Dataset with this profile, built by
            saving your rules into the Profile Crate and reading them back, so it shows exactly what survives
            (including any documented round-trip simplifications).
            Required (MUST) values that are empty show an error, recommended (SHOULD) values show an amber warning.
          </p>
          <p v-if="roundTrip.error" class="mt-2 text-[11px] text-destructive">
            The emitted crate could not be parsed back ({{ roundTrip.error }}), the preview below falls back to the in-memory rules.
          </p>
          <div v-if="!controls.length" class="mt-3 text-xs text-muted-foreground">
            The Dataset entity has no property rules yet, so no inputs are generated.
          </div>
          <div v-else class="mt-3 grid gap-3 sm:grid-cols-2">
            <!-- Entity references are filled with a sub-form in the dataset dialog;
                 the review preview just names the referenced types. -->
            <div
              v-for="control in controls.filter((c) => c.control === 'entity')"
              :key="control.property"
              class="sm:col-span-2"
            >
              <label class="flex items-center gap-2 text-xs font-medium text-foreground">
                {{ control.label }}
                <Badge v-if="control.obligation" :variant="obligationBadgeVariant(control.obligation)" class="text-[10px]">
                  {{ PROFILE_OBLIGATION_LABELS[control.obligation].label }}
                </Badge>
              </label>
              <div class="mt-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                References
                <span class="font-medium text-foreground">{{ control.entityRule ? entityTypeLabel(control.entityRule.type) : entityTypeLabel(control.entityTypes?.[0] ?? '') || 'an entity' }}</span>
               , added as {{ control.multiple ? 'one or more sub-forms' : 'a sub-form' }} when creating a dataset.
              </div>
              <p
                v-for="violation in violationsFor(control.property)"
                :key="violation.ruleId + violation.pointer"
                class="mt-1 text-[11px]"
                :class="violation.severity === 'error' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'"
              >
                {{ violation.message }}
              </p>
            </div>
            <ProfileControlField
              v-for="control in controls.filter((c) => c.control !== 'entity')"
              :key="control.property"
              :control="control"
              :model-value="values[control.property]"
              :violations="violationsFor(control.property)"
              disabled
              :class="control.control === 'textarea' || control.control === 'tags' ? 'sm:col-span-2' : ''"
            />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="schema">
        <p class="mb-2 text-[11px] text-muted-foreground">Validation rules, value constraints plus which properties are required (MUST) and recommended (SHOULD).</p>
        <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ builder.generatedSchemaText }}</pre>
      </TabsContent>

      <TabsContent value="mode">
        <p class="mb-2 text-[11px] text-muted-foreground">Describo/Crate-O-compatible mode file, form structure only, usable directly in those editors. Constraints and recommended levels stay in the validation rules.</p>
        <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ modeText }}</pre>
      </TabsContent>

      <TabsContent value="crate">
        <p class="mb-2 text-[11px] text-muted-foreground">The complete profile document that is saved, all three files travel inside it.</p>
        <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ builder.generatedCrateText }}</pre>
      </TabsContent>
    </Tabs>
  </section>
</template>
