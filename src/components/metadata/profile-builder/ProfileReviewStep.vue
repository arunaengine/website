<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/ui/Badge.vue'
import Notice from '@/components/ui/Notice.vue'
import Tabs from '@/components/ui/Tabs.vue'
import TabsList from '@/components/ui/TabsList.vue'
import TabsTrigger from '@/components/ui/TabsTrigger.vue'
import TabsContent from '@/components/ui/TabsContent.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import ProfileControlField from '@/components/metadata/ProfileControlField.vue'
import LiftNotesPanel from './LiftNotesPanel.vue'
import ProfileVisibility from './ProfileVisibility.vue'
import { CheckCircle2, AlertTriangle, ChevronDown, Download, FileCode2, Lightbulb, Repeat2 } from '@lucide/vue'
import { controlsFromRules, defaultControlValues, normalizeProfileValues } from '@/lib/profiles/controls'
import { buildProfileArtifactTexts, parseProfileCrate } from '@/lib/profiles/rocrate'
import { validateProfileData } from '@/lib/profiles/validate'
import { obligationBadgeVariant, PROFILE_ENTITY_SOURCE_LABELS, PROFILE_OBLIGATION_LABELS, PROFILE_VALUE_KIND_LABELS } from '@/lib/profiles/labels'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { errorMessage } from '@/lib/utils'
import type { ProfilePropertyRule } from '@/lib/profiles/types'
import type { ProfileBlocker } from './state/blockers'
import type { ProfileBuilder } from './useProfileBuilder'

const props = withDefaults(
  defineProps<{ builder: ProfileBuilder; blockers?: ProfileBlocker[] }>(),
  { blockers: () => [] },
)
const emit = defineEmits<{ (e: 'step', step: number): void }>()
const builder = props.builder

// Readable rule sentences (the plan 6.2 outline shape), leading the review so
// authors verify their intent before any raw artifact appears.
const ruleSentences = computed(() =>
  builder.normalizedEntities.map((entity) => ({
    key: entity.id,
    label: entity.label,
    type: entity.type,
    rules: entity.propertyRules.map((rule) => ({
      key: rule.id,
      obligation: rule.obligation,
      label: rule.label || rule.valueName,
      target:
        rule.kind === 'entity'
          ? `references ${(rule.entityTypes ?? []).map((type) => entityTypeLabel(type)).filter(Boolean).join(' or ') || 'an entity'}`
          : PROFILE_VALUE_KIND_LABELS[rule.kind] ?? rule.kind,
      repeatable: rule.kind === 'keyword-list' || Boolean(rule.multipleValues),
    })),
  })),
)

// All raw artifacts live under ONE collapsed disclosure (plan 6.1 Review);
// texts come from the same emitter the crate embeds, so they can never drift.
const generatedFilesOpen = ref(false)
const artifactTexts = computed(() =>
  buildProfileArtifactTexts({
    ...builder.profileBasics(),
    entityRules: builder.normalizedEntities,
    importedMode: builder.importedMode ?? undefined,
    customShapesText: builder.customShapesText.trim() ? builder.customShapesText : undefined,
  }),
)

// Per-artifact downloads: the same texts the crate embeds, saved as real files
// so a generated SHACL shape (or any artifact) is usable outside the portal.
function downloadText(text: string | undefined, filename: string, type: string) {
  if (!text) return
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const fileSlug = computed(() => builder.slug.trim() || 'profile')
const artifactDownloads = computed(() => [
  { label: 'shapes.ttl', text: artifactTexts.value.shapes, filename: `${fileSlug.value}.shapes.ttl`, type: 'text/turtle' },
  { label: 'schema.json', text: artifactTexts.value.schema, filename: `${fileSlug.value}.schema.json`, type: 'application/json' },
  { label: 'mode.json', text: artifactTexts.value.mode, filename: `${fileSlug.value}.mode.json`, type: 'application/json' },
  { label: 'profile.html', text: artifactTexts.value.html, filename: `${fileSlug.value}.profile.html`, type: 'text/html' },
  { label: 'profile RO-Crate', text: builder.generatedCrateText, filename: `${fileSlug.value}.crate.json`, type: 'application/json' },
])

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
  if (rule.entitySources?.length) {
    lines.push(`Allowed sources: ${rule.entitySources.map((source) => PROFILE_ENTITY_SOURCE_LABELS[source].label).join('; ')}.`)
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

// Preview honesty: the form preview is built from the ROUND-TRIPPED parse,
// the emitted crate (buildProfileCrate) parsed back the way the dataset dialog
// will parse it, not from the in-memory rules. The round-trip is lossy by
// design in documented spots (e.g. a text rule with multiple values flattens to
// a keyword list); the preview showing that loss is the point.
const roundTrip = computed<{ parsed: ReturnType<typeof parseProfileCrate> | null; error: string | null }>(() => {
  try {
    return { parsed: parseProfileCrate(builder.generatedCrate), error: null }
  } catch (err) {
    return { parsed: null, error: errorMessage(err) }
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

const normalizedValues = computed(() => normalizeProfileValues(values.value, controls.value))
const violations = computed(() => validateProfileData(previewSchema.value, normalizedValues.value))

function violationsFor(property: string) {
  return violations.value.filter((violation) => violation.fieldId === property)
}
</script>

<template>
  <section class="space-y-4">
    <!-- Everything that keeps the Create button disabled, from the same list the
         button reads, each with the next step where one exists. -->
    <Notice v-if="blockers.length" tone="warning" class="rounded-lg p-3" data-tour="profile-review">
      <div class="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle class="h-4 w-4" /> This profile cannot be created yet.
      </div>
      <ul class="mt-1 list-disc space-y-0.5 pl-4">
        <li v-for="blocker in blockers" :key="blocker.message">
          {{ blocker.message }}
          <RouterLink
            v-if="blocker.action?.route"
            :to="blocker.action.route"
            class="font-medium underline-offset-2 hover:underline"
          >{{ blocker.action.label }}</RouterLink>
          <button
            v-else-if="blocker.action?.step"
            type="button"
            class="font-medium underline-offset-2 hover:underline"
            @click="emit('step', blocker.action.step)"
          >{{ blocker.action.label }}</button>
        </li>
      </ul>
    </Notice>
    <div v-else data-tour="profile-review" class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 class="h-4 w-4" /> This profile is ready to create.
    </div>

    <!-- Visibility is chosen once, on the basics step; here it is only stated. -->
    <div class="rounded-lg border border-border p-3">
      <ProfileVisibility :builder="builder" readonly @change="emit('step', 1)" />
    </div>

    <!-- Non-blocking authoring suggestions (e.g. prefer a schema.org term). -->
    <Notice v-if="builder.rulesHints.length" tone="warning" :lines="builder.rulesHints" class="rounded-lg p-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Lightbulb class="h-4 w-4" /> Suggestions
      </div>
    </Notice>

    <!-- Imported SHACL that no rule below represents. Repeated from the Rules
         step so it is still in view at the point of committing. -->
    <LiftNotesPanel :notes="builder.liftNotes" :attached="Boolean(builder.customShapesText.trim())" />

    <!-- Readable rule sentences: what the profile requires, per entity. -->
    <div class="rounded-lg border border-border p-3">
      <div class="text-sm font-medium text-foreground">Rules</div>
      <div v-for="entity in ruleSentences" :key="entity.key" class="mt-2">
        <div class="text-xs font-medium text-muted-foreground">{{ entity.label }}</div>
        <p v-if="!entity.rules.length" class="mt-1 text-[11px] text-muted-foreground">No property rules.</p>
        <ul v-else class="mt-1 space-y-1">
          <li v-for="rule in entity.rules" :key="rule.key" class="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground">
            <Badge :variant="obligationBadgeVariant(rule.obligation)" size="sm">{{ rule.obligation }}</Badge>
            <span class="font-medium">{{ rule.label }}</span>
            <span class="text-muted-foreground">{{ rule.target }}</span>
            <span v-if="rule.repeatable" class="inline-flex items-center gap-0.5 text-muted-foreground"><Repeat2 class="h-3 w-3" /> repeatable</span>
          </li>
        </ul>
      </div>
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
              <Badge :variant="obligationBadgeVariant(rule.obligation)" size="sm">{{ PROFILE_OBLIGATION_LABELS[rule.obligation].label }}</Badge>
              <span class="font-medium">{{ rule.label }}</span>
            </span>
            <ul class="ml-4 list-disc space-y-0.5 text-muted-foreground">
              <li v-for="line in rule.lines" :key="line">{{ line }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </div>

    <!-- Form preview leads (with the rule sentences) before any raw artifact. -->
    <div class="rounded-lg border border-border p-4">
      <div class="text-sm font-medium text-foreground">Form preview</div>
      <p class="mt-1 text-xs text-muted-foreground">
        A read-only preview of the form users see when they create a dataset with this profile, built by
        saving your rules into the profile RO-Crate and reading them back, so it shows exactly what survives
        (including any documented round-trip simplifications).
        Required (MUST) values that are empty show an error, recommended (SHOULD) values show an amber warning.
      </p>
      <p v-if="roundTrip.error" class="mt-2 text-[11px] text-destructive">
        The emitted RO-Crate could not be parsed back ({{ roundTrip.error }}), the preview below falls back to the in-memory rules.
      </p>
      <div v-if="!controls.length" class="mt-3 text-xs text-muted-foreground">
        The dataset entity has no property rules yet, so no inputs are generated.
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
            <Badge v-if="control.obligation" :variant="obligationBadgeVariant(control.obligation)" size="sm">
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

    <!-- All raw artifacts under ONE disclosure (plan 6.1 Review): the rules
         above are the source of truth; these files are derived from them. -->
    <div class="rounded-lg border border-border">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        :aria-expanded="generatedFilesOpen"
        @click="generatedFilesOpen = !generatedFilesOpen"
      >
        <span class="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          <Tooltip label="Your rules are written out as four files that travel inside the profile; the node validates against shapes.ttl.">
            <span>Generated files</span>
          </Tooltip>
          <Badge variant="secondary" size="sm">profile.html · mode.json · schema.json · shapes.ttl</Badge>
          <!-- Imported source shapes: read-only chip with count. -->
          <Badge v-if="builder.customShapesMeta" variant="secondary" size="sm" class="inline-flex items-center gap-1">
            <FileCode2 class="h-3 w-3" /> {{ builder.customShapesMeta.fileName }} merged into shapes.ttl<template v-if="builder.customShapesMeta.shapeCount !== undefined"> · {{ builder.customShapesMeta.shapeCount }} {{ builder.customShapesMeta.shapeCount === 1 ? 'shape' : 'shapes' }}</template>
          </Badge>
        </span>
        <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform" :class="generatedFilesOpen ? 'rotate-180' : ''" />
      </button>
      <div v-if="generatedFilesOpen" class="border-t border-border p-3">
        <p class="text-xs text-muted-foreground">
          Your rules generate these files inside the profile RO-Crate; the node validates datasets against
          <b class="text-foreground">shapes.ttl</b>.
          <RouterLink
            :to="{ name: 'docs', params: { topic: 'build-a-profile' } }"
            class="font-medium text-primary hover:underline"
          >Learn how profiles work</RouterLink>
        </p>
        <div class="mt-2 flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] font-medium text-muted-foreground">Download:</span>
          <button
            v-for="artifact in artifactDownloads"
            :key="artifact.label"
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground transition-colors hover:border-aruna-royal/60 hover:bg-aruna-royal/10"
            @click="downloadText(artifact.text, artifact.filename, artifact.type)"
          >
            <Download class="size-3" /> {{ artifact.label }}
          </button>
        </div>
        <Tabs default-value="schema" class="mt-3">
          <TabsList>
            <TabsTrigger value="schema">Validation rules</TabsTrigger>
            <TabsTrigger value="mode">Mode file</TabsTrigger>
            <TabsTrigger value="html">Description</TabsTrigger>
            <TabsTrigger value="shapes">SHACL shapes</TabsTrigger>
            <TabsTrigger value="crate">Profile RO-Crate</TabsTrigger>
          </TabsList>

          <TabsContent value="schema">
            <p class="mb-2 text-[11px] text-muted-foreground">Validation rules (<code>schema.json</code>), value constraints plus which properties are required (MUST) and recommended (SHOULD).</p>
            <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ artifactTexts.schema }}</pre>
          </TabsContent>

          <TabsContent value="mode">
            <p class="mb-2 text-[11px] text-muted-foreground">Describo/Crate-O-compatible mode file (<code>mode.json</code>), form structure only, usable directly in those editors.</p>
            <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ artifactTexts.mode }}</pre>
          </TabsContent>

          <TabsContent value="html">
            <p class="mb-2 text-[11px] text-muted-foreground">Human-readable specification (<code>profile.html</code>), the RFC-2119 wording of the rules.</p>
            <pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ artifactTexts.html }}</pre>
          </TabsContent>

          <TabsContent value="shapes">
            <p class="mb-2 text-[11px] text-muted-foreground">
              Unified generated and imported SHACL shapes (<code>shapes.ttl</code>), used by the node to validate datasets.
            </p>
            <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ artifactTexts.shapes }}</pre>
          </TabsContent>

          <TabsContent value="crate">
            <p class="mb-2 text-[11px] text-muted-foreground">The complete profile that is saved, all generated files travel inside it.</p>
            <pre class="max-h-72 overflow-auto rounded-md bg-muted p-3 text-[11px] text-foreground/80">{{ builder.generatedCrateText }}</pre>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  </section>
</template>
