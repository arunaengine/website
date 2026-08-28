<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/ui/Button.vue'
import Notice from '@/components/ui/Notice.vue'
import { Plus, X } from '@lucide/vue'
import { effectiveEntitySources } from '@/lib/profiles/sources'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { normalizeTypeUri, sameSchemaOrgType } from '@/lib/profiles/uri'
import EntityTypePicker from '../EntityTypePicker.vue'
import { trimmed, type DraftPropertyRule, type ProfileBuilder } from '../useProfileBuilder'

const props = defineProps<{
  builder: ProfileBuilder
  property: DraftPropertyRule
  disabled: boolean
  isHasPart: boolean
}>()

const selectedSources = computed(() => effectiveEntitySources(props.property.entitySources))

// Explanation shown under the referenced-types picker. hasPart and
// required-contents cases get their own guidance; otherwise summarize the policy
// as the sentence dataset authors will experience.
const referenceHelp = computed(() => {
  if (props.isHasPart) {
    return 'Values come from the dataset’s data references (its attached files); each required item below is checked against them, and more are always allowed.'
  }
  if (props.property.requiredInstances.length) {
    return 'Values become @id references to entities in the dataset. The required items below must be present; more are always allowed.'
  }
  const phrases = selectedSources.value.map((source) => {
    if (source === 'new') return 'describe a new entity'
    if (source === 'existing-external') return 'reuse one via an external URI'
    return 'reuse an entity from this dataset'
  })
  return `Dataset authors may ${phrases.join(', or ')}.`
})

const profileEntityRules = computed(() =>
  props.builder.entities
    .map((item) => {
      const uri = normalizeTypeUri(item.type)
      return { uri, label: trimmed(item.label) || entityTypeLabel(uri) }
    })
    .filter((item) => item.uri),
)

// Selected targets as removable chips, labeled by the profile shape that
// defines them (when one exists) with a plain type-label fallback.
const selectedTargets = computed(() =>
  props.property.entityTypes
    .filter(Boolean)
    .map((uri) => {
      const shape = profileEntityRules.value.find((rule) => sameSchemaOrgType(rule.uri, uri))
      return { uri, label: shape ? shape.label : entityTypeLabel(uri), hasShape: Boolean(shape) }
    }),
)

// Selected targets that no entity rule defines; no sub-form is generated for
// them until one is created (offered inline as a quick action).
const unresolvedTargets = computed(() =>
  props.property.entityTypes
    .filter((uri) => uri && !profileEntityRules.value.some((rule) => sameSchemaOrgType(rule.uri, uri)))
    .map((uri) => ({ uri, label: entityTypeLabel(uri) })),
)

function addTarget(choice: { uri: string }) {
  if (!choice.uri) return
  const list = props.property.entityTypes
  if (!list.some((entry) => sameSchemaOrgType(entry, choice.uri))) list.push(choice.uri)
}

function removeTarget(uri: string) {
  const list = props.property.entityTypes
  const index = list.indexOf(uri)
  if (index >= 0) list.splice(index, 1)
}

// Append an entity rule for an other-type target and select it (D6). The target
// stays selected on this property; once a rule exists it resolves to a sub-form.
function createEntityRule(uri: string) {
  props.builder.addEntityRuleForType(uri)
}
</script>

<template>
  <div class="mt-2 space-y-2">
    <div>
      <label class="text-[11px] font-medium text-muted-foreground">Referenced entity types</label>
      <p class="text-[11px] text-muted-foreground">{{ referenceHelp }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="target in selectedTargets"
        :key="target.uri"
        class="inline-flex items-center gap-1 rounded-full border border-aruna-royal/60 bg-aruna-royal/10 px-2.5 py-1 text-[11px] text-foreground"
        :title="target.uri"
      >
        {{ target.label }}
        <span v-if="target.hasShape" class="text-[10px] text-muted-foreground">(shape)</span>
        <button
          v-if="!disabled"
          type="button"
          class="text-muted-foreground transition-colors hover:text-destructive"
          :aria-label="`Remove target ${target.label}`"
          @click="removeTarget(target.uri)"
        >
          <X class="size-3" />
        </button>
      </span>
      <span v-if="!selectedTargets.length" class="text-[11px] text-muted-foreground">No target type yet, add one:</span>
    </div>
    <EntityTypePicker
      v-if="!disabled"
      :builder="builder"
      :exclude="property.entityTypes"
      button-label="Add target type"
      @pick="addTarget"
    />
    <!-- A selected other-type target has no rule, so no sub-form is generated:
         offer to create one in a click. -->
    <Notice
      v-for="target in unresolvedTargets"
      :key="target.uri"
      tone="warning"
      class="flex flex-wrap items-center gap-2 border-dashed px-2.5 py-1.5 text-[11px]"
    >
      <span>No entity rule defines <b>{{ target.label }}</b>, no sub-form is generated for it yet.</span>
      <Button v-if="!disabled" type="button" variant="outline" size="sm" @click="createEntityRule(target.uri)">
        <Plus class="h-3 w-3" /> Create entity rule for {{ target.label }}
      </Button>
    </Notice>
  </div>
</template>
