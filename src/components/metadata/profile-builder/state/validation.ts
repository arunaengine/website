import { CURATED_PROPERTY_TERMS, isSchemaOrgUri } from '@/lib/profiles/propertyCatalog'
import { CURATED_ENTITY_TYPES, entityTypeLabel } from '@/lib/profiles/entityTypes'
import { isHasPartUri } from '@/lib/profiles/emit'
import { referencesToType } from '@/lib/profiles/mode'
import {
  isAbsoluteUri,
  isDatasetType,
  isValidClassName,
  isValidPropertyTermName,
  normalizeTypeUri,
  sameSchemaOrgType,
  termNameFromUri,
} from '@/lib/profiles/uri'
import type { ProfileEntityRule } from '@/lib/profiles/types'
import {
  hasPreservedUrlOptions,
  propertyName,
  toText,
  trimmed,
  type BasicsFieldError,
  type DraftEntityRule,
} from './drafts'

// Everything the basics step validates, read once from the builder's state.
export interface BasicsInput {
  needsToken: boolean
  groupId: string
  slug: string
  name: string
  description: string
  version: string
  datePublished: string
  license: string
}

// Non-blocking authoring hints. Two kinds:
//  - a custom (non-schema.org) term whose compact name only *resembles* a
//    curated schema.org property (different case), suggest the schema.org term;
//    an exact-name shadow is a blocking error instead (see rulesErrors).
//  - an entity-reference target type with no entity rule in this profile, so no
//    sub-form gets generated for it.
export function rulesHintsFor(drafts: DraftEntityRule[], normalized: ProfileEntityRule[]): string[] {
  const hints: string[] = []
  const curatedNames = new Set(CURATED_PROPERTY_TERMS.map((term) => term.name))
  const curatedByLower = new Map(CURATED_PROPERTY_TERMS.map((term) => [term.name.toLowerCase(), term.name]))
  for (const entity of normalized) {
    for (const rule of entity.propertyRules) {
      if (!isSchemaOrgUri(rule.propertyUri) && !curatedNames.has(rule.valueName)) {
        const canonical = curatedByLower.get(rule.valueName.toLowerCase())
        if (canonical) hints.push(`${entity.label} / ${rule.label}: "${rule.valueName}" resembles the schema.org "${canonical}" term, consider using it.`)
      }
      // A reference is only fieldless when NONE of its target types has a rule:
      // the sub-form resolves to the first that does (see resolveEntityRule), so
      // the extra members of a union ("a Gene or a Protein") cost nothing.
      if (rule.kind === 'entity' && (rule.entityTypes ?? []).length) {
        const targets = rule.entityTypes ?? []
        const resolves = targets.some((target) =>
          normalized.some((candidate) => sameSchemaOrgType(candidate.type, target)),
        )
        if (!resolves) {
          const names = targets.map(entityTypeLabel).join(' or ')
          hints.push(`${entity.label} / ${rule.label} references ${names}, but no entity rule defines it, no sub-form will be generated for ${names}.`)
        }
      }
    }
  }
  // H1: an entity rule that nothing references generates no dataset input, while
  // its SHACL shape still targets the class (lib/shacl/projection.ts), so the
  // note is informational. An IMPORTED rule is exempt: a class-targeted shape
  // stands on its own in the file it came from.
  const importedTypes = new Set(drafts.filter((draft) => draft.imported).map((draft) => normalizeTypeUri(draft.type)))
  for (const entity of normalized) {
    if (isDatasetType(entity.type) || importedTypes.has(entity.type)) continue
    if (!referencesToType(entity.type, normalized).length) {
      const type = entityTypeLabel(entity.type) || entity.label
      hints.push(`No property asks for a ${type} yet. Datasets get no ${type} field from this profile, but any ${type} they do describe is still checked against "${entity.label}".`)
    }
  }
  // L10: two entity rules sharing one type URI serialize entity references with
  // the LAST rule's class token (buildModeContext / classNameByType are last-wins).
  const seenTypes = new Map<string, ProfileEntityRule>()
  const reportedTypeCollisions = new Set<string>()
  for (const entity of normalized) {
    const prior = [...seenTypes.entries()].find(([type]) => sameSchemaOrgType(type, entity.type))
    if (prior && !reportedTypeCollisions.has(entity.type)) {
      reportedTypeCollisions.add(entity.type)
      hints.push(`Two entity rules use the type ${entityTypeLabel(entity.type)}, entity references to ${entityTypeLabel(entity.type)} will use class "${entity.className}".`)
    }
    seenTypes.set(entity.type, entity)
  }
  return hints
}

// Step-scoped validation so each step can gate its own "Next" button.
// Basics errors carry a fieldId anchor so ProfileBasicsStep renders each one
// inline at its input ('token' anchors to the bearer-token banner); the step
// callout only shows entries with no anchor.
export function basicsErrorsFor(input: BasicsInput): BasicsFieldError[] {
  const errors: BasicsFieldError[] = []
  if (input.needsToken) errors.push({ fieldId: 'token', message: 'Add a bearer token in Settings before creating profiles.' })
  if (!input.groupId) errors.push({ fieldId: 'group', message: 'Choose a group.' })
  const slugValue = trimmed(input.slug)
  if (!slugValue) errors.push({ fieldId: 'slug', message: 'Slug is required.' })
  else if (!/^[a-z0-9_-]+$/.test(slugValue)) errors.push({ fieldId: 'slug', message: 'Slug must use lowercase letters, digits, dashes, or underscores.' })
  if (!trimmed(input.name)) errors.push({ fieldId: 'name', message: 'Name is required.' })
  if (!trimmed(input.description)) errors.push({ fieldId: 'description', message: 'Description is required.' })
  if (!trimmed(input.version)) errors.push({ fieldId: 'version', message: 'Version is required.' })
  else if (!/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/.test(trimmed(input.version))) errors.push({ fieldId: 'version', message: 'Version should look like semver, for example 0.1.0.' })
  const dateValue = toText(input.datePublished).trim()
  if (!dateValue) errors.push({ fieldId: 'datePublished', message: 'Date published is required.' })
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) errors.push({ fieldId: 'datePublished', message: 'Date published must be a valid date, for example 2024-01-31.' })
  if (!trimmed(input.license)) errors.push({ fieldId: 'license', message: 'License URL is required.' })
  return errors
}

export function rulesErrorsFor(
  drafts: DraftEntityRule[],
  normalized: ProfileEntityRule[],
  dataset: ProfileEntityRule | undefined,
): string[] {
  const errors: string[] = []
  if (!normalized.length) errors.push('Add at least one entity rule.')
  if (!dataset) errors.push('Add a dataset entity rule so dataset metadata inputs can be generated.')

  // Class short names across the normalized rules, for the property-vs-class
  // collision guard below (case-insensitive, defense in depth per D2).
  const classNamesLower = new Set(normalized.map((entity) => entity.className.toLowerCase()))

  // Validate the RAW drafts (D2): label-less drafts are dropped and typed value
  // names are no longer stripped by normalization, so an added-but-blank or
  // malformed entry must be caught here on exactly what the author typed.
  drafts.forEach((entity, entityIndex) => {
    const entityName = trimmed(entity.label) || `Entity rule ${entityIndex + 1}`
    if (!trimmed(entity.label)) errors.push(`Entity rule ${entityIndex + 1} needs a label.`)
    // Custom (non-schema.org) types carry an editable class name; it must be
    // upper camel case so it never collides with a lower-camel property term.
    const entityType = normalizeTypeUri(entity.type)
    if (entityType && !isSchemaOrgUri(entityType)) {
      const className = trimmed(entity.className) || termNameFromUri(entityType)
      if (!isValidClassName(className)) {
        errors.push(`${entityName}: class name "${className}" must start with a capital letter, then letters or digits only, e.g. Specimen.`)
      }
    }
    entity.properties.forEach((property, propertyIndex) => {
      const propLabel = trimmed(property.label) || `property ${propertyIndex + 1}`
      if (!trimmed(property.label)) errors.push(`${entityName} / property ${propertyIndex + 1} needs a label.`)
      // A typed value name is validated as-is; an empty one is auto-derived from
      // the label (always valid), so only validate when the author typed one.
      const typedValueName = trimmed(property.valueName)
      if (typedValueName && !isValidPropertyTermName(typedValueName)) {
        errors.push(`${entityName} / ${propLabel}: property name "${typedValueName}" must have a lowercase first letter and use only letters and digits, e.g. assayType.`)
      }
      // M6: when nothing is typed and the label auto-derives to nothing usable
      // (all non-ASCII, or digits-only), normalization would silently fall back to
      // the generic `field` name (or drop the rule). Block it instead of exporting
      // a meaningless term.
      if (!typedValueName && trimmed(property.label) && !propertyName(trimmed(property.label))) {
        errors.push(`${entityName} / ${propLabel}: add a property name (letters and digits, starting lowercase).`)
      }
      // Property terms and class names must stay distinct (case-insensitively)
      // so the merged @context can never shadow a type with a property.
      if (typedValueName && classNamesLower.has(typedValueName.toLowerCase())) {
        errors.push(`${entityName} / ${propLabel}: property name "${typedValueName}" collides with an entity class name, rename it so property and class names stay distinct.`)
      }
      // WS5/M2: only validate the required-contents rows that would actually be
      // emitted: entity references that are multi-valued. Otherwise a row hidden by
      // a multiple-off toggle could still gate Next with an invisible error.
      if (property.kind === 'entity' && property.multipleValues) {
        property.requiredInstances.forEach((row, rowIndex) => {
          if (!trimmed(row.value)) {
            errors.push(`${entityName} / ${propLabel}: required item ${rowIndex + 1} needs a value to match.`)
          }
        })
      }
    })
  })

  const curatedNames = new Set(CURATED_PROPERTY_TERMS.map((term) => term.name))
  const entityIds = new Set<string>()
  // Two entity rules that serialize to the same class name collide (last-wins)
  // in mode.classes and $defs; block it on the canonical className (D3).
  const classNames = new Set<string>()
  const reportedClassNames = new Set<string>()
  // A compact term can bind to only one URI in the crate @context: track which
  // propertyUri each valueName maps to across ALL entity rules.
  const uriByValueName = new Map<string, string>()
  const reportedUriConflicts = new Set<string>()

  for (const entity of normalized) {
    // Duplicate derived entity ids collide on the crate `@id` and lose rules on reparse.
    if (entityIds.has(entity.id)) errors.push(`Duplicate entity id "${entity.id}", rename one entity.`)
    entityIds.add(entity.id)
    if (classNames.has(entity.className) && !reportedClassNames.has(entity.className)) {
      errors.push(`Two entity rules use the same class name "${entity.className}", give them distinct class names or types.`)
      reportedClassNames.add(entity.className)
    }
    classNames.add(entity.className)
    // H5: a class name that (case-insensitively) matches a curated entity type
    // while its type URI differs would redefine that standard type's alias in the
    // crate @context; block it.
    const curatedShadow = CURATED_ENTITY_TYPES.find(
      (curated) => curated.label.toLowerCase() === entity.className.toLowerCase(),
    )
    if (curatedShadow && !sameSchemaOrgType(curatedShadow.uri, entity.type)) {
      errors.push(`Class name "${entity.className}" would redefine the standard ${curatedShadow.label} type, rename the class or use the schema.org type.`)
    }
    if (!entity.propertyRules.length) errors.push(`${entity.label} needs at least one property rule.`)

    const properties = new Set<string>()
    const propertyIds = new Set<string>()
    const propertyUris = new Set<string>()
    for (const property of entity.propertyRules) {
      if (properties.has(property.valueName)) errors.push(`${entity.label} has a duplicate property: ${property.valueName}.`)
      properties.add(property.valueName)
      // Two labels that slugify identically derive the same crate `@id`; block
      // it so a rule is not silently overwritten and lost on reparse.
      if (propertyIds.has(property.id)) errors.push(`${entity.label} has two properties that derive the same id "${property.id}", rename one.`)
      propertyIds.add(property.id)
      // Every term must resolve via @context: an absolute URI (minted or external).
      if (!isAbsoluteUri(property.propertyUri)) {
        errors.push(`${entity.label} / ${property.label} needs a valid absolute property URI.`)
      }
      if (propertyUris.has(property.propertyUri)) errors.push(`${entity.label} has two properties using the same term URI (${property.propertyUri}).`)
      propertyUris.add(property.propertyUri)
      // Cross-entity: one compact term mapped to two different URIs cannot both
      // resolve in @context.
      const priorUri = uriByValueName.get(property.valueName)
      if (priorUri === undefined) {
        uriByValueName.set(property.valueName, property.propertyUri)
      } else if (priorUri !== property.propertyUri && !reportedUriConflicts.has(property.valueName)) {
        errors.push(`Property name "${property.valueName}" maps to two different term URIs (${priorUri} and ${property.propertyUri}), a compact term can bind to only one URI in @context.`)
        reportedUriConflicts.add(property.valueName)
      }
      // A non-schema.org term whose compact name exactly matches a curated
      // schema.org property shadows that base-context term: a hard error.
      if (!isSchemaOrgUri(property.propertyUri) && curatedNames.has(property.valueName)) {
        errors.push(`${entity.label} / ${property.label}: "${property.valueName}" maps to a non-schema.org URI but shadows the schema.org "${property.valueName}" term in the base @context, use the schema.org term or rename the property.`)
      }
      if (property.kind === 'entity' && !property.entityTypes?.length) {
        errors.push(`${entity.label} / ${property.label} is an entity reference and needs at least one target type.`)
      }
      // M5: hasPart values are always crate entity references (attached files /
      // datasets); a scalar kind would emit a bare literal the dataset dialog's
      // data-references section cannot represent, bricking it. Block it.
      if (isHasPartUri(property.propertyUri) && property.kind !== 'entity') {
        errors.push(`${entity.label} / ${property.label}: hasPart must be an entity reference.`)
      }
      // select-url is authorable: it needs at least one allowed URL and every
      // option must be an absolute URL, or it can never be picked/validate (WS3).
      // A preserved (non-string) imported option set is read-only and skips the
      // absolute-URL gate (L1). select-object stays import-only; an empty one is a
      // dead-end.
      if (property.kind === 'select-url') {
        if (!property.valueOptions?.length) {
          errors.push(`${entity.label} / ${property.label}: add at least one allowed URL.`)
        } else if (!hasPreservedUrlOptions(property.valueOptions) && property.valueOptions.some((option) => typeof option !== 'string' || !isAbsoluteUri(option))) {
          errors.push(`${entity.label} / ${property.label}: every allowed value must be an absolute URL, e.g. https://….`)
        }
      } else if (property.kind === 'select-object' && !property.valueOptions?.length) {
        errors.push(`${entity.label} / ${property.label}: preserved choice property has no options, remove it or re-import.`)
      }
      if (property.kind === 'enum' && !property.enumOptions?.length) errors.push(`${entity.label} / ${property.label} needs at least one allowed value.`)
      // WS2: list cardinality (min >= 1, max >= min). minItems/maxItems are only
      // set on multi-valued rules (normalizeProperty guards that).
      if (property.minItems !== undefined && property.minItems < 1) {
        errors.push(`${entity.label} / ${property.label}: minimum entries must be at least 1.`)
      }
      if (property.maxItems !== undefined && property.maxItems < 1) {
        errors.push(`${entity.label} / ${property.label}: maximum entries must be at least 1.`)
      }
      if (property.minItems !== undefined && property.maxItems !== undefined && property.maxItems < property.minItems) {
        errors.push(`${entity.label} / ${property.label}: maximum entries cannot be less than minimum entries.`)
      }
      if (property.stepValue !== undefined && property.stepValue <= 0) {
        errors.push(`${entity.label} / ${property.label}: step must be greater than 0.`)
      }
      if (property.pattern) {
        try {
          new RegExp(property.pattern)
        } catch {
          errors.push(`${entity.label} / ${property.label} has an invalid pattern.`)
        }
      }
    }
  }
  return errors
}
