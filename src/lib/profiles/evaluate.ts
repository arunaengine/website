// Profile conformance evaluator — evaluates a stored RO-Crate against the
// machine-readable rules of the profile it declares conformance to, producing
// violations that carry a stable, scoped rule id.
//
// ─── Rule id scheme (client-side contract) ──────────────────────────────────
// The backend CEL programs (aruna#253/#255, not yet implemented) will mirror
// this exactly, compiled from the same schema.json:
//
//   ruleId := <profileSlug> "/" <entity> "/" <property> "/" <constraint>
//
//   profileSlug  document path minus "profiles/" (MetadataProfile.id)
//   entity       "Dataset" for the root, else the schema $defs key
//                (ProfileEntityRule.className || termNameFromUri(type))
//   property     the compact JSON key (rule.valueName / schema properties key);
//                "" for entity-level violations
//   constraint   closed vocabulary (below)
//
// Violation payload (wire contract):
//   ruleId      identity of the RULE — CEL parity is on this + severity
//   constraint  last ruleId segment, kept split for cheap filtering
//   severity    'error' | 'warning' — MUST→error (blocking), SHOULD→warning,
//               invalid present value→error
//   entity      scope: 'Dataset' or a $defs class key
//   instance?   index of the violating entity instance
//   fieldId?    property key the violation anchors to
//   pointer     JSON pointer within the evaluated value record, e.g. '/species'
//   message     human text — NOT part of identity; CEL may differ
//   hint?       e.g. 'Example: …'
//
// Constraint vocabulary (closed; matches validate.ts):
//   required · recommended · enum · pattern · minLength · maxLength · minimum ·
//   maximum · multipleOf · minItems · maxItems · type.array · type.string ·
//   type.integer · type.number · type.boolean · format.date · format.date-time ·
//   format.email · format.uri · requiredInstance.<n>
//     (<n> = index into the rule's requiredInstances filtered to entries with
//      name||id — the same order as the schema.json contains/allOf emission)
//
// ─── Coverage notes (honest limits) ─────────────────────────────────────────
// - Operates on the flattened, compact-key crate form the portal emits (no
//   JSON-LD expansion): crates authored elsewhere with nested entities or
//   full-URI keys may under-report.
// - Callers must feed FULL crates only, never `rocrate_summary` — a truncated
//   `hasPart` would fabricate violations.
// - `requiredInstances` are enforced for `hasPart` rules only — parity with the
//   dataset dialog's documented residual.
// - Profiles without machine-readable rules are not evaluable — callers show
//   "not checked".
import type { JsonSchema, ProfileEntityRule, ProfilePropertyRule, ProfileViolation } from './types'
import { validateProfileData, validateRequiredInstances } from './validate'
import { schemaFromPropertyRules } from './schema'
import { isDatasetType, isInvalidReferenceUri, isRecord, REFERENCE_URI_MESSAGE, sameSchemaOrgType, termNameFromUri } from './uri'
import { isHasPartUri } from './emit'

export interface ViolationScope {
  profileSlug: string
  entity: string
  instance?: number
}

// Stamps ruleId/entity/instance onto raw validate.ts output. Identity only —
// severity, pointer, message pass through untouched.
export function scopeViolations(scope: ViolationScope, violations: ProfileViolation[]): ProfileViolation[] {
  return violations.map((violation) => ({
    ...violation,
    entity: scope.entity,
    ...(scope.instance !== undefined ? { instance: scope.instance } : {}),
    ruleId: `${scope.profileSlug}/${scope.entity}/${violation.fieldId ?? ''}/${violation.constraint}`,
  }))
}

// One fully-scoped violation, for call sites that build violations directly
// (reference-format checks in the dialog and in evaluateCrate).
export function scopedViolation(
  scope: ViolationScope,
  constraint: string,
  fieldId: string,
  message: string,
  severity: ProfileViolation['severity'] = 'error',
  pointer?: string,
  hint?: string,
): ProfileViolation {
  return {
    constraint,
    ruleId: `${scope.profileSlug}/${scope.entity}/${fieldId}/${constraint}`,
    entity: scope.entity,
    ...(scope.instance !== undefined ? { instance: scope.instance } : {}),
    pointer: pointer ?? `/${fieldId.replace(/~/g, '~0').replace(/\//g, '~1')}`,
    fieldId,
    message,
    severity,
    ...(hint ? { hint } : {}),
  }
}

// The $defs / rule-id entity key for an entity rule (or its target types when no
// rule resolves) — must equal schema.ts's $defs keying.
export function entityClassKey(rule: ProfileEntityRule | undefined, targetTypes?: string[]): string {
  if (rule) return rule.className || termNameFromUri(rule.type)
  const target = (targetTypes ?? []).find((type) => type)
  return target ? termNameFromUri(target) : 'Entity'
}

export interface EvaluableProfile {
  slug: string
  schema?: JsonSchema
  entityRules: ProfileEntityRule[]
  datasetPropertyRules: ProfilePropertyRule[]
}

export interface ProfileEvaluation {
  profileSlug: string
  violations: ProfileViolation[]
  errorCount: number
  warningCount: number
  conformant: boolean
}

export function evaluateCrate(crate: unknown, profile: EvaluableProfile): ProfileEvaluation {
  const g = graph(crate)
  const root = rootEntity(g) ?? {}
  const schema = profile.schema ?? schemaFromPropertyRules({ name: '', description: '' }, profile.datasetPropertyRules)
  const violations: ProfileViolation[] = []
  const datasetScope: ViolationScope = { profileSlug: profile.slug, entity: 'Dataset' }

  // 2. Dataset value record + hasPart entries, mirroring the dialog's
  //    normalizedGeneratedValues shapes.
  const { values: rootValues, hasPartEntries } = entityValueRecord(root, profile.datasetPropertyRules, g)

  // 3. Root schema violations (presence + scalar/list constraints).
  violations.push(...scopeViolations(datasetScope, validateProfileData(schema, rootValues)))

  for (const rule of profile.datasetPropertyRules) {
    if (rule.kind !== 'entity') continue
    // 5. hasPart required instances (the only requiredInstances the portal enforces).
    if (isHasPartUri(rule.propertyUri)) {
      violations.push(...scopeViolations(datasetScope, validateRequiredInstances(rule, hasPartEntries[rule.valueName] ?? [])))
      continue
    }
    // 4. External reference format (validate.ts does not enforce format: iri).
    if (rule.referenceMode === 'external') {
      const multiple = ruleMultiple(rule)
      idValues(root[rule.valueName]).forEach((refId, index) => {
        if (isInvalidReferenceUri(refId)) {
          violations.push(
            scopedViolation(
              datasetScope,
              'format.uri',
              rule.valueName,
              REFERENCE_URI_MESSAGE,
              'error',
              multiple ? `/${rule.valueName}/${index}` : `/${rule.valueName}`,
            ),
          )
        }
      })
      continue
    }
    // Crate references are picked from the existing data references — no format or
    // sub-form validation.
    if (rule.referenceMode === 'crate') continue
    // 6. Inline entity instances: validate each resolvable sub-entity against the
    //    target entity rule, scoped to its class key + instance index.
    const entityRule = resolveEntityRule(rule, profile.entityRules)
    if (!entityRule) continue
    const instanceEntity = entityClassKey(entityRule, rule.entityTypes)
    const instanceSchema = schemaFromPropertyRules({ name: rule.label, description: rule.description }, entityRule.propertyRules)
    idValues(root[rule.valueName]).forEach((refId, index) => {
      const target = entityById(g, refId)
      // A missing target is a legitimate bare reference, not an incomplete instance.
      if (!target) return
      const { values } = entityValueRecord(target, entityRule.propertyRules, g)
      violations.push(
        ...scopeViolations({ profileSlug: profile.slug, entity: instanceEntity, instance: index }, validateProfileData(instanceSchema, values)),
      )
    })
  }

  const errorCount = violations.filter((violation) => violation.severity === 'error').length
  return {
    profileSlug: profile.slug,
    violations,
    errorCount,
    warningCount: violations.length - errorCount,
    conformant: errorCount === 0,
  }
}

// ─── Private helpers (small local re-implementations so the module stays
//     self-contained; rocrate.ts / controls.ts keep the equivalents private) ──

function graph(crate: unknown): Array<Record<string, unknown>> {
  if (!isRecord(crate)) return []
  const g = crate['@graph']
  return Array.isArray(g) ? g.filter(isRecord) : []
}

function rootEntity(g: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  const descriptor = g.find((entity) => entity['@id'] === 'ro-crate-metadata.json')
  const about = descriptor?.about
  const aboutId = isRecord(about) && typeof about['@id'] === 'string' ? about['@id'] : undefined
  const nonDescriptor = g.filter((entity) => entity['@id'] !== 'ro-crate-metadata.json')
  if (aboutId) {
    const byAbout = nonDescriptor.find((entity) => entity['@id'] === aboutId)
    if (byAbout) return byAbout
  }
  return nonDescriptor.find((entity) => typesOf(entity).some(isDatasetType)) ?? nonDescriptor[0]
}

function entityById(g: Array<Record<string, unknown>>, id: string): Record<string, unknown> | undefined {
  return g.find((entity) => entity['@id'] === id)
}

function typesOf(entity: Record<string, unknown>): string[] {
  const type = entity['@type']
  if (typeof type === 'string') return [type]
  if (Array.isArray(type)) return type.filter((value): value is string => typeof value === 'string')
  return []
}

function idValue(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry
  if (isRecord(entry) && typeof entry['@id'] === 'string') return entry['@id']
  return undefined
}

function idValues(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list.map(idValue).filter((id): id is string => Boolean(id))
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length ? textValue(value[0]) : ''
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return ''
}

// Scalar extraction mirroring the dialog: strings/numbers/booleans pass through,
// `{"@id"}` objects unwrap to their id (covers license), arrays map items the
// same way. Missing key → undefined (drives presence checks).
function scalarValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value.map(scalarValue)
  if (isRecord(value) && typeof value['@id'] === 'string') return value['@id']
  return value
}

function ruleMultiple(rule: ProfilePropertyRule): boolean {
  return rule.kind === 'keyword-list' || Boolean(rule.multipleValues)
}

// Same matcher as controls.ts::resolveEntityRule.
function resolveEntityRule(rule: ProfilePropertyRule, entities: ProfileEntityRule[]): ProfileEntityRule | undefined {
  for (const target of rule.entityTypes ?? []) {
    const match = entities.find((entity) => sameSchemaOrgType(entity.type, target))
    if (match) return match
  }
  return undefined
}

// Build the value record fed to validateProfileData for one entity's own keys.
// hasPart-bound entity rules additionally yield `{ id, name }` entries for the
// separate validateRequiredInstances pass.
function entityValueRecord(
  entity: Record<string, unknown>,
  rules: ProfilePropertyRule[],
  g: Array<Record<string, unknown>>,
): { values: Record<string, unknown>; hasPartEntries: Record<string, Array<{ id: string; name: string }>> } {
  const values: Record<string, unknown> = {}
  const hasPartEntries: Record<string, Array<{ id: string; name: string }>> = {}
  for (const rule of rules) {
    if (rule.kind === 'entity') {
      const refIds = idValues(entity[rule.valueName])
      if (isHasPartUri(rule.propertyUri)) {
        const entries = refIds.map((id) => ({ id, name: textValue(entityById(g, id)?.name) || id }))
        hasPartEntries[rule.valueName] = entries
        values[rule.valueName] = entries
      } else {
        values[rule.valueName] = ruleMultiple(rule) ? refIds : refIds[0] ?? ''
      }
    } else if (rule.kind === 'select-object') {
      const refIds = idValues(entity[rule.valueName])
      values[rule.valueName] = ruleMultiple(rule) ? refIds : refIds[0] ?? ''
    } else {
      values[rule.valueName] = scalarValue(entity[rule.valueName])
    }
  }
  return { values, hasPartEntries }
}
