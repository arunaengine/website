import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { liftShapes, type LiftResult } from './lift'
import { shapesFromEntityRules } from './projection'
import { normalizeTypeUri, sameSchemaOrgType } from '../profiles/uri'
import type { ProfileEntityRule } from '../profiles/types'

const PREFIXES = [
  '@prefix ex: <http://example.org/> .',
  '@prefix schema: <http://schema.org/> .',
  '@prefix sh: <http://www.w3.org/ns/shacl#> .',
  '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
]

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')
}

function lift(name: string): LiftResult {
  return liftShapes(fixture(name))
}

function entityFor(result: LiftResult, type: string): ProfileEntityRule | undefined {
  return result.entities.find((entity) => sameSchemaOrgType(entity.type, type))
}

function ruleFor(entity: ProfileEntityRule | undefined, valueName: string) {
  return entity?.propertyRules.find((rule) => rule.valueName === valueName)
}

// An entity-kind rule whose target types resolve to NO entity rule renders a
// sub-form with no fields of its own. This is the invariant the whole transitive
// resolution exists to hold, so every fixture is checked against it.
function danglingRules(result: LiftResult): string[] {
  const dangling: string[] = []
  for (const entity of result.entities) {
    for (const rule of entity.propertyRules) {
      if (rule.kind !== 'entity') continue
      const targets = rule.entityTypes ?? []
      const resolves = targets.some((target) => entityFor(result, target))
      if (!resolves) dangling.push(`${entity.className}/${rule.valueName} -> ${targets.join(', ') || '(none)'}`)
    }
  }
  return dangling
}

function signature(entities: ProfileEntityRule[]): string {
  return JSON.stringify(
    entities.map((entity) => [
      entity.type,
      entity.className,
      entity.propertyRules.map((rule) => [rule.valueName, rule.kind, rule.obligation, rule.entityTypes ?? []]),
    ]),
  )
}

describe('value shapes end the chain', () => {
  it('inlines a literal-only shape', () => {
    // TextValueShape is an sh:or over string and langString: the value itself.
    const result = lift('value-shape.ttl')
    const substance = entityFor(result, 'http://schema.org/ChemicalSubstance')
    expect(ruleFor(substance, 'name')?.kind).toBe('text')
    expect(ruleFor(substance, 'position')?.kind).toBe('integer')
    expect(danglingRules(result)).toEqual([])
  })

  it('gives a literal shape no rule', () => {
    const result = lift('value-shape.ttl')
    expect(result.entities.map((entity) => entity.className)).toEqual(['ChemicalSubstance'])
  })
})

describe('composition through sh:node', () => {
  it('folds the base shape rules in', () => {
    const result = lift('extends-chain.ttl')
    const term = entityFor(result, 'http://schema.org/DefinedTerm')
    expect(term).toBeDefined()
    expect(term?.propertyRules.map((rule) => rule.valueName).sort()).toEqual(['name', 'termCode'])
    expect(ruleFor(entityFor(result, 'http://schema.org/ChemicalSubstance'), 'chemicalRole')?.entityTypes)
      .toEqual(['http://schema.org/DefinedTerm'])
    expect(danglingRules(result)).toEqual([])
  })
})

describe('union target types', () => {
  it('keeps every stated type', () => {
    const result = lift('union-type.ttl')
    const substance = entityFor(result, 'http://schema.org/ChemicalSubstance')
    expect(ruleFor(substance, 'hasBioChemEntityPart')?.entityTypes).toEqual([
      'http://schema.org/BioChemEntity',
      'http://schema.org/Gene',
      'http://schema.org/Protein',
    ])
    expect(ruleFor(substance, 'image')?.entityTypes).toEqual([
      'http://schema.org/ImageObject',
      'http://schema.org/MediaObject',
    ])
    // The first member carries the form; the rest are extra accepted types.
    expect(entityFor(result, 'http://schema.org/BioChemEntity')).toBeDefined()
    expect(entityFor(result, 'http://schema.org/ImageObject')).toBeDefined()
    expect(danglingRules(result)).toEqual([])
  })
})

describe('target bindings', () => {
  it('merges into the shape they bind', () => {
    const result = lift('target-binding.ttl')
    expect(result.entities.map((entity) => entity.className).sort()).toEqual(['Dataset', 'Profile'])
    expect(entityFor(result, 'http://www.w3.org/ns/dx/prof/Profile')?.propertyRules.map((rule) => rule.valueName))
      .toEqual(['version'])
    expect(danglingRules(result)).toEqual([])
  })
})

describe('diamonds and cycles', () => {
  it('yields one rule per type', () => {
    const result = lift('diamond.ttl')
    expect(result.entities.filter((entity) => entity.className === 'Person')).toHaveLength(1)
    expect(danglingRules(result)).toEqual([])
  })

  it('terminates on mutual references', () => {
    const result = lift('cycle.ttl')
    expect(result.entities.map((entity) => entity.className).sort()).toEqual(['Dataset', 'Organization', 'Person'])
    expect(ruleFor(entityFor(result, 'http://schema.org/Person'), 'knows')?.entityTypes)
      .toEqual(['http://schema.org/Person'])
    expect(danglingRules(result)).toEqual([])
  })
})

// A base lattice: every shape on a level composes every shape on the next one.
// Composition that is not memoized walks width^depth distinct paths through it.
function lattice(width: number, depth: number): string {
  const level = (index: number) => Array.from({ length: width }, (_, node) => `ex:L${index}N${node}`).join(', ')
  const lines = [
    ...PREFIXES,
    `ex:TopShape a sh:NodeShape ; sh:class schema:Person ; sh:node ${level(0)} ;`,
    '    sh:property [ sh:path schema:name ; sh:datatype xsd:string ] .',
  ]
  for (let index = 0; index < depth; index++) {
    for (let node = 0; node < width; node++) {
      const bases = index + 1 < depth ? `sh:node ${level(index + 1)} ;` : ''
      lines.push(`ex:L${index}N${node} a sh:NodeShape ; ${bases}`)
      lines.push(`    sh:property [ sh:path schema:p${index}x${node} ; sh:datatype xsd:string ] .`)
    }
  }
  return lines.join('\n')
}

// One straight composition chain, deeper than the inheritance cap allows.
function deepChain(depth: number): string {
  const lines = [
    ...PREFIXES,
    'ex:TopShape a sh:NodeShape ; sh:class schema:Person ; sh:node ex:D0 ;',
    '    sh:property [ sh:path schema:name ; sh:datatype xsd:string ] .',
  ]
  for (let index = 0; index < depth; index++) {
    const base = index + 1 < depth ? `sh:node ex:D${index + 1} ;` : ''
    lines.push(`ex:D${index} a sh:NodeShape ; ${base}`)
    lines.push(`    sh:property [ sh:path schema:d${index} ; sh:datatype xsd:string ] .`)
  }
  return lines.join('\n')
}

describe('wide base lattices', () => {
  it('composes each shape once', { timeout: 10_000 }, () => {
    // Without memoization this walks 4^12 paths, which hangs the tab.
    const result = liftShapes(lattice(4, 12))
    const person = entityFor(result, 'http://schema.org/Person')
    expect(person?.propertyRules).toHaveLength(4 * 12 + 1)
    expect(ruleFor(person, 'p11x3')).toBeDefined()
  })
})

describe('the inheritance depth cap', () => {
  it('reports where it cut', () => {
    const result = liftShapes(deepChain(40))
    const person = entityFor(result, 'http://schema.org/Person')
    expect(ruleFor(person, 'd0')).toBeDefined()
    expect(ruleFor(person, 'd39')).toBeUndefined()
    const capped = result.notes.find((note) => note.message.includes('levels deep'))
    expect(capped?.kind).toBe('partial')
    expect(capped?.scopes).toEqual(['http://example.org/D32'])
  })
})

describe('inherited sh:class', () => {
  it('reaches through the whole chain', () => {
    const result = lift('class-chain.ttl')
    expect(result.entities.map((entity) => entity.className).sort()).toEqual(['Dataset', 'Person'])
    const person = entityFor(result, 'http://schema.org/Person')
    expect(person?.propertyRules.map((rule) => rule.valueName).sort()).toEqual(['email', 'jobTitle', 'name'])
    expect(ruleFor(entityFor(result, 'http://schema.org/Dataset'), 'author')?.entityTypes)
      .toEqual(['http://schema.org/Person'])
    expect(danglingRules(result)).toEqual([])
  })
})

describe('the ChemicalSubstance binding', () => {
  const result = lift('chemical-substance.shacl.ttl')

  it('resolves the whole shape graph', () => {
    expect(result.shapeCount).toBe(12)
    expect(result.entities).toHaveLength(9)
    expect(result.fieldCount).toBe(28)
    expect(result.entities.map((entity) => entity.className)).toEqual([
      'Dataset',
      'InCrateEntity',
      'DefinedTerm',
      'PropertyValue',
      'BioChemEntity',
      'ImageObject',
      'Profile',
      'ResourceDescriptor',
      'ChemicalSubstance',
    ])
  })

  it('leaves no reference without a form', () => {
    expect(danglingRules(result)).toEqual([])
  })

  it('reads literal properties as text', () => {
    const substance = entityFor(result, 'http://schema.org/ChemicalSubstance')
    expect(ruleFor(substance, 'name')?.kind).toBe('text')
    expect(ruleFor(substance, 'description')?.kind).toBe('longtext')
    expect(ruleFor(substance, 'alternateName')?.kind).toBe('text')
    expect(ruleFor(substance, 'identifier')?.kind).toBe('text')
  })

  it('mints a type outside the parse base', () => {
    // The file resolves its own prefix against the crate base IRI; an arcp type
    // would travel into the exported profile as a class of nothing.
    const minted = entityFor(result, 'https://w3id.org/aruna/profiles/imported#InCrateEntity')
    expect(minted).toBeDefined()
    expect(result.entities.every((entity) => !entity.type.startsWith('arcp:'))).toBe(true)
  })

  it('keeps every rule saveable', () => {
    // Both blocking builder gates: no empty entity, no repeated class name.
    const names = result.entities.map((entity) => entity.className)
    expect(new Set(names).size).toBe(names.length)
    expect(result.entities.every((entity) => entity.propertyRules.length > 0)).toBe(true)
  })
})

describe('projection round trip', () => {
  // The SHACL form of an entity reference that allows external reuse cannot
  // state its target type (an untyped IRI would fail the class check), so a
  // bare-Turtle re-import loses those types once. mode.json is the lossless
  // channel for a saved profile. Pinned here so the loss stays where it is:
  // it must happen in the FIRST generation and never grow after it.
  const names = [
    'value-shape.ttl',
    'extends-chain.ttl',
    'union-type.ttl',
    'target-binding.ttl',
    'diamond.ttl',
    'cycle.ttl',
    'chemical-substance.shacl.ttl',
  ]

  for (const name of names) {
    it(`reaches a fixed point for ${name}`, () => {
      const first = liftShapes(fixture(name))
      const second = liftShapes(shapesFromEntityRules({ slug: 'fixture', name: 'Fixture' }, first.entities))
      const third = liftShapes(shapesFromEntityRules({ slug: 'fixture', name: 'Fixture' }, second.entities))
      expect(signature(second.entities)).toBe(signature(third.entities))
      // The entity SET itself never degrades, only the reuse-allowing targets.
      expect(second.entities.map((entity) => entity.type).sort()).toEqual(first.entities.map((entity) => entity.type).sort())
      expect(danglingRules(third)).toEqual(danglingRules(second))
    })
  }
})

describe('type URI normalization', () => {
  it('passes a minted type through', () => {
    // Load bearing: lift mints types under schemes the projection must emit
    // verbatim. Prefixing schema.org onto them corrupts every export.
    expect(normalizeTypeUri('https://w3id.org/aruna/profiles/imported#InCrateEntity'))
      .toBe('https://w3id.org/aruna/profiles/imported#InCrateEntity')
    expect(normalizeTypeUri('arcp://name,aruna-portal/crate/#InCrateEntity'))
      .toBe('arcp://name,aruna-portal/crate/#InCrateEntity')
    expect(normalizeTypeUri('urn:example:Specimen')).toBe('urn:example:Specimen')
    expect(normalizeTypeUri('Dataset')).toBe('http://schema.org/Dataset')
    expect(normalizeTypeUri('Person')).toBe('http://schema.org/Person')
    expect(normalizeTypeUri('')).toBe('')
  })
})
