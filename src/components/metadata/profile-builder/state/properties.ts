import type { Ref } from 'vue'
import { draftProperty, uniquifyDraftId, type DraftEntityRule, type PropertyRuleTemplate } from './drafts'

// Property-rule editing bound to the builder's draft state.
export function propertyActions(highlightPropertyUid: Ref<number | null>) {
  function addProperty(entity: DraftEntityRule) {
    const draft = draftProperty()
    entity.properties.push(draft)
    highlightPropertyUid.value = draft.uid
  }

  function addPropertyTemplate(entity: DraftEntityRule, template: PropertyRuleTemplate) {
    const draft = template.create()
    const n = uniquifyDraftId(new Set(entity.properties.map((property) => property.id)), draft.id)
    if (n) {
      draft.id = `${draft.id}-${n}`
      draft.label = `${draft.label} ${n}`
      draft.valueName = `${draft.valueName}${n}`
    }
    entity.properties.push(draft)
    highlightPropertyUid.value = draft.uid
  }

  // Reorder a rule inside its entity. Array order IS the authored order: it
  // drives the form, the mode inputs and the emitted sh:order (see projection.ts).
  function moveProperty(entity: DraftEntityRule, from: number, to: number) {
    const list = entity.properties
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
  }

  function removeProperty(entity: DraftEntityRule, index: number) {
    // Defense in depth: locked (RO-Crate baseline) rules are never removable.
    if (entity.properties[index]?.lock) return
    entity.properties.splice(index, 1)
  }

  return { addProperty, addPropertyTemplate, moveProperty, removeProperty }
}
