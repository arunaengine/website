import { describe, expect, it } from 'vitest'
import { controlsFromRules } from './controls'
import { emitEntityEntries, type AddEntity, type EntityEmitContext } from './emit'
import {
  MAX_ENTITY_DEPTH,
  countEntryErrors,
  isEntityEntryList,
  newEntityEntry,
  subControlsFor,
  validateEntries,
} from './entityTree'
import type { EntityEntry } from './entityEntries'
import type { ProfileControl, ProfileEntityRule, ProfilePropertyRule } from './types'

const SCHEMA = 'http://schema.org/'
const SAMPLE_TYPE = 'https://bioschemas.org/Sample'

function rule(
  overrides: Partial<ProfilePropertyRule> & Pick<ProfilePropertyRule, 'valueName' | 'kind' | 'obligation'>,
): ProfilePropertyRule {
  return {
    id: overrides.valueName,
    label: overrides.valueName,
    description: '',
    propertyUri: `${SCHEMA}${overrides.valueName}`,
    ...overrides,
  }
}

// Mirrors the Bioschemas Sample profile chain: Dataset → Sample →
// additionalProperty (PropertyValue) → valueReference (CategoryCode), with
// subjectOf as a RULELESS target that must stay a flat URI reference.
const ENTITIES: ProfileEntityRule[] = [
  {
    id: 'sample',
    label: 'Sample',
    description: '',
    type: SAMPLE_TYPE,
    className: 'Sample',
    propertyRules: [
      rule({ valueName: 'identifier', kind: 'text', obligation: 'MUST', multipleValues: true }),
      rule({ valueName: 'name', kind: 'text', obligation: 'MAY' }),
      rule({
        valueName: 'additionalProperty',
        kind: 'entity',
        obligation: 'MAY',
        multipleValues: true,
        entityTypes: [`${SCHEMA}PropertyValue`],
      }),
      rule({
        valueName: 'subjectOf',
        kind: 'entity',
        obligation: 'MAY',
        multipleValues: true,
        entityTypes: [`${SCHEMA}CreativeWork`],
      }),
    ],
  },
  {
    id: 'property-value',
    label: 'Property Value',
    description: '',
    type: `${SCHEMA}PropertyValue`,
    className: 'PropertyValue',
    propertyRules: [
      rule({ valueName: 'name', kind: 'text', obligation: 'MUST' }),
      rule({ valueName: 'value', kind: 'text', obligation: 'MUST' }),
      rule({
        valueName: 'valueReference',
        kind: 'entity',
        obligation: 'SHOULD',
        multipleValues: true,
        entityTypes: [`${SCHEMA}CategoryCode`],
      }),
    ],
  },
  {
    id: 'category-code',
    label: 'Category Code',
    description: '',
    type: `${SCHEMA}CategoryCode`,
    className: 'CategoryCode',
    propertyRules: [
      rule({ valueName: 'codeValue', kind: 'text', obligation: 'MUST', multipleValues: true }),
      rule({ valueName: 'url', kind: 'url', obligation: 'MUST', multipleValues: true }),
    ],
  },
]

const SAMPLE_REF = rule({
  valueName: 'bioschemasample',
  kind: 'entity',
  obligation: 'MUST',
  multipleValues: true,
  entityTypes: [SAMPLE_TYPE],
})

function sampleControl(): ProfileControl {
  return controlsFromRules([SAMPLE_REF], ENTITIES)[0]
}

function subControl(parent: ProfileControl, property: string): ProfileControl {
  const control = subControlsFor(parent, ENTITIES).find((entry) => entry.property === property)
  if (!control) throw new Error(`missing sub-control ${property}`)
  return control
}

// The dialog's addEntity: first entity wins per @id, later ones merge props.
function makeSink() {
  const byId = new Map<string, Record<string, unknown>>()
  const entities: Array<Record<string, unknown>> = []
  const addEntity: AddEntity = (entity) => {
    const id = String(entity['@id'])
    const existing = byId.get(id)
    if (existing) {
      for (const [key, value] of Object.entries(entity)) {
        if (existing[key] === undefined) existing[key] = value
      }
      return
    }
    byId.set(id, entity)
    entities.push(entity)
  }
  return { entities, addEntity, get: (id: string) => byId.get(id) }
}

function emitCtx(sink: ReturnType<typeof makeSink>): EntityEmitContext {
  return {
    entityRules: ENTITIES,
    contextTerms: {},
    validCrateIds: new Set<string>(),
    usedSyntheticIds: new Set<string>(),
    addEntity: sink.addEntity,
  }
}

// A filled 3-level entry: Sample → PropertyValue → CategoryCode, plus a flat
// subjectOf URI on the Sample.
function filledSample(): EntityEntry {
  const control = sampleControl()
  const apControl = subControl(control, 'additionalProperty')
  const vrControl = subControl(apControl, 'valueReference')
  const vr = newEntityEntry(vrControl, ENTITIES, 3)
  vr.instance = { ...vr.instance, codeValue: ['GO:0001'], url: ['http://purl.org/code'] }
  const ap = newEntityEntry(apControl, ENTITIES, 2)
  ap.instance = { ...ap.instance, name: 'growth medium', value: 'LB', valueReference: [vr] }
  const sample = newEntityEntry(control, ENTITIES, 1)
  sample.instance = {
    ...sample.instance,
    identifier: ['S-1'],
    name: 'Sample one',
    additionalProperty: [ap],
    subjectOf: ['https://doi.org/10.1/x'],
  }
  return sample
}

describe('nested entity seeding', () => {
  it('seeds nesting fields as entries', () => {
    const entry = newEntityEntry(sampleControl(), ENTITIES, 1)
    // MAY rules seed empty entry lists; ruleless targets stay flat URI arrays.
    expect(isEntityEntryList(entry.instance?.additionalProperty)).toBe(true)
    expect(entry.instance?.subjectOf).toEqual([])
  })

  it('caps cyclic seeding', () => {
    // A class whose MUST child is itself must stop seeding at the depth cap
    // and degrade to the flat reference input, not recurse forever.
    const loopType = `${SCHEMA}LoopThing`
    const loopEntities: ProfileEntityRule[] = [
      {
        id: 'loop',
        label: 'Loop',
        description: '',
        type: loopType,
        className: 'LoopThing',
        propertyRules: [rule({ valueName: 'child', kind: 'entity', obligation: 'MUST', entityTypes: [loopType] })],
      },
    ]
    const control = controlsFromRules([rule({ valueName: 'loop', kind: 'entity', obligation: 'MUST', entityTypes: [loopType] })], loopEntities)[0]
    let cursor = newEntityEntry(control, loopEntities, 1)
    let depth = 1
    for (;;) {
      const child = cursor.instance?.child
      if (!isEntityEntryList(child) || !child.length) {
        expect(child).toBe('')
        break
      }
      expect(child).toHaveLength(1)
      cursor = child[0]
      depth += 1
    }
    expect(depth).toBe(MAX_ENTITY_DEPTH)
  })
})

describe('nested entity validation', () => {
  const ctx = { entityRules: ENTITIES, crateIds: new Set<string>() }

  it('flags nested required fields', () => {
    const control = sampleControl()
    const sample = newEntityEntry(control, ENTITIES, 1)
    const ap = newEntityEntry(subControl(control, 'additionalProperty'), ENTITIES, 2)
    sample.instance = { ...sample.instance, additionalProperty: [ap], subjectOf: ['not a uri'] }
    const nodes = validateEntries([sample], control, ctx, 1)
    const own = nodes[0].own
    expect(own.some((violation) => violation.ruleId === 'required' && violation.fieldId === 'identifier')).toBe(true)
    // The flat ruleless reference keeps its URI format gate.
    expect(own.some((violation) => violation.ruleId === 'format.uri' && violation.fieldId === 'subjectOf')).toBe(true)
    const nested = nodes[0].nested.additionalProperty[0].own
    expect(nested.filter((violation) => violation.ruleId === 'required').map((violation) => violation.fieldId).sort()).toEqual(['name', 'value'])
    // SHOULD presence of the depth-3 list warns without blocking.
    expect(nested.some((violation) => violation.ruleId === 'recommended' && violation.fieldId === 'valueReference' && violation.severity === 'warning')).toBe(true)
    expect(countEntryErrors(nodes)).toBe(4)
  })

  it('passes a filled chain', () => {
    const nodes = validateEntries([filledSample()], sampleControl(), ctx, 1)
    expect(countEntryErrors(nodes)).toBe(0)
  })
})

describe('nested entity emission', () => {
  it('flattens the chain', () => {
    const sink = makeSink()
    const refs = emitEntityEntries(sampleControl(), [filledSample()], emitCtx(sink), 1)
    expect(refs).toEqual([{ '@id': '#sample-sample-one' }])
    const sample = sink.get('#sample-sample-one')
    expect(sample?.['@type']).toBe('Sample')
    expect(sample?.additionalProperty).toEqual([{ '@id': '#propertyvalue-growth-medium' }])
    expect(sample?.subjectOf).toEqual([{ '@id': 'https://doi.org/10.1/x' }])
    const property = sink.get('#propertyvalue-growth-medium')
    expect(property?.['@type']).toBe('PropertyValue')
    expect(property?.value).toBe('LB')
    expect(property?.valueReference).toEqual([{ '@id': '#categorycode-1' }])
    expect(sink.get('#categorycode-1')?.codeValue).toEqual(['GO:0001'])
  })

  it('dedupes shared nested ids', () => {
    // Two described-new entries naming the same @id merge into one entity and
    // one reference, at nested depth exactly like at the top level.
    const control = sampleControl()
    const apControl = subControl(control, 'additionalProperty')
    const first = newEntityEntry(apControl, ENTITIES, 2)
    first.instance = { ...first.instance, name: 'medium', value: 'LB' }
    first.customId = '#shared'
    const second = newEntityEntry(apControl, ENTITIES, 2)
    second.instance = { ...second.instance, name: 'medium', value: 'M9' }
    second.customId = '#shared'
    const sample = newEntityEntry(control, ENTITIES, 1)
    sample.instance = { ...sample.instance, identifier: ['S-2'], additionalProperty: [first, second] }
    const sink = makeSink()
    emitEntityEntries(control, [sample], emitCtx(sink), 1)
    expect(sink.get('#sample-1')?.additionalProperty).toEqual([{ '@id': '#shared' }])
    expect(sink.entities.filter((entity) => entity['@id'] === '#shared')).toHaveLength(1)
    expect(sink.get('#shared')?.value).toBe('LB')
  })
})
