import type { Ref } from 'vue'
import { entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { normalizeTypeUri, sameSchemaOrgType, SCHEMA_ORG, termNameFromUri } from '@/lib/profiles/uri'
import {
  draftEntity,
  draftProperty,
  propertyName,
  trimmed,
  uniquifyDraftId,
  type DraftEntityRule,
  type EntityRuleTemplate,
} from './drafts'

// A property valueName unique within `owner`, suffixing 2,3,… on collision, so a
// prefilled quick-add never lands on a duplicate name that would gate Next.
function uniqueValueName(base: string, owner: DraftEntityRule): string {
  const taken = new Set(owner.properties.map((property) => trimmed(property.valueName)))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}

// Entity-rule editing bound to the builder's draft state.
export function entityActions(
  entities: Ref<DraftEntityRule[]>,
  selectedEntityIndex: Ref<number>,
  highlightPropertyUid: Ref<number | null>,
) {
  function selectEntity(index: number) {
    selectedEntityIndex.value = index
  }

  // New entity rules default to Person (H2), not dataset: a second dataset rule
  // duplicates the root's class name and traps first-timers, whereas Person lands
  // them on the guided "not referenced yet" path.
  function addEntity() {
    entities.value.push(draftEntity({ type: `${SCHEMA_ORG}Person` }))
    selectedEntityIndex.value = entities.value.length - 1
  }

  // Quick action (D6): create an entity rule for a referenced target type and
  // select it. If a rule for the type already exists, select that one instead of
  // adding a colliding duplicate. className is derived here for schema.org types
  // (left blank so the editor keeps deriving it) and set for custom types. The new
  // rule is seeded with a MUST name property (M2) so it does not instantly gate
  // Next with "needs at least one property rule".
  function addEntityRuleForType(type: string, label?: string) {
    const uri = normalizeTypeUri(type)
    if (!uri) return
    const existing = entities.value.findIndex((entity) => sameSchemaOrgType(normalizeTypeUri(entity.type), uri))
    if (existing >= 0) {
      selectedEntityIndex.value = existing
      return
    }
    entities.value.push(
      draftEntity({
        type: uri,
        label: trimmed(label) || entityTypeLabel(uri),
        className: isSchemaOrgUri(uri) ? '' : termNameFromUri(uri),
        properties: [
          draftProperty({
            id: 'name',
            label: 'Name',
            valueName: 'name',
            propertyUri: `${SCHEMA_ORG}name`,
            obligation: 'MUST',
            description: `The name of the ${trimmed(label) || entityTypeLabel(uri)}.`,
          }),
        ],
      }),
    )
    selectedEntityIndex.value = entities.value.length - 1
  }

  // Referenced-by quick action (D6): append a prefilled entity-reference property
  // on `owner` that targets `target`, then navigate to the owner so the new rule
  // is visible. Makes an unreferenced entity rule take effect in one click. For a
  // Person/Organization target the prefill uses schema.org `contributor` (M2)
  // rather than minting a term off the label; other targets mint from the label.
  function addReferenceProperty(owner: DraftEntityRule, target: DraftEntityRule) {
    const targetType = normalizeTypeUri(target.type)
    const isPersonOrOrg =
      sameSchemaOrgType(targetType, `${SCHEMA_ORG}Person`) || sameSchemaOrgType(targetType, `${SCHEMA_ORG}Organization`)
    const draft = isPersonOrOrg
      ? draftProperty({
          label: 'Contributor',
          valueName: uniqueValueName('contributor', owner),
          propertyUri: `${SCHEMA_ORG}contributor`,
          kind: 'entity',
          entityTypes: [targetType],
          obligation: 'MAY',
        })
      : draftProperty({
          label: trimmed(target.label),
          valueName: uniqueValueName(propertyName(trimmed(target.label)) || 'reference', owner),
          kind: 'entity',
          entityTypes: [targetType],
          obligation: 'MAY',
        })
    owner.properties.push(draft)
    const ownerIndex = entities.value.indexOf(owner)
    if (ownerIndex >= 0) selectedEntityIndex.value = ownerIndex
    // Flag the new card so PropertyRuleCard scrolls it into view and flashes it.
    highlightPropertyUid.value = draft.uid
  }

  function removeEntity(index: number) {
    // Defense in depth: locked (RO-Crate baseline) entities are never removable.
    if (entities.value[index]?.lock) return
    entities.value.splice(index, 1)
    if (selectedEntityIndex.value >= entities.value.length) {
      selectedEntityIndex.value = Math.max(0, entities.value.length - 1)
    }
  }

  function addEntityTemplate(template: EntityRuleTemplate) {
    const draft = template.create()
    const n = uniquifyDraftId(new Set(entities.value.map((entity) => entity.id)), draft.id)
    if (n) {
      draft.id = `${draft.id}-${n}`
      draft.label = `${draft.label} ${n}`
    }
    entities.value.push(draft)
    selectedEntityIndex.value = entities.value.length - 1
  }

  return {
    selectEntity,
    addEntity,
    addEntityRuleForType,
    addReferenceProperty,
    addEntityTemplate,
    removeEntity,
  }
}
