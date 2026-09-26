import { describe, expect, it } from 'vitest'
import { shapesFromEntityRules } from './projection'
import type { ProfileEntityRule } from '@/lib/profiles/types'

const BASICS = { slug: 'example', name: 'Example profile' }

function rule(type: string, label: string, className: string): ProfileEntityRule {
  return {
    id: className.toLowerCase(),
    label,
    description: '',
    type,
    className,
    propertyRules: [{
      id: `${className.toLowerCase()}-name`,
      label: 'Name',
      description: '',
      kind: 'text',
      propertyUri: 'http://schema.org/name',
      valueName: 'name',
      obligation: 'MUST',
    }],
  }
}

describe('SHACL projection targets', () => {
  it('targets the class of every non-root shape', () => {
    // What the unreferenced-shape note states: the node still checks these.
    const turtle = shapesFromEntityRules(BASICS, [
      rule('http://schema.org/Dataset', 'Root dataset', 'Dataset'),
      rule('http://schema.org/Person', 'Person', 'Person'),
    ])

    expect(turtle).toContain('sh:targetClass schema:Person')
  })

  it('leaves the root shape untargeted, and targets a second Dataset shape', () => {
    // The validator binds the root shape to the crate root at run time; a second
    // Dataset-typed shape is class-targeted and so hits the root as well.
    const turtle = shapesFromEntityRules(BASICS, [
      rule('http://schema.org/Dataset', 'Root dataset', 'Dataset'),
      rule('http://schema.org/Dataset', 'Part dataset', 'PartDataset'),
    ])

    expect(turtle.match(/sh:targetClass schema:Dataset/g)).toHaveLength(1)
  })
})

describe('SHACL projection entity references', () => {
  function withReference(target: string): ProfileEntityRule[] {
    const root = rule('http://schema.org/Dataset', 'Root dataset', 'Dataset')
    root.propertyRules.push({
      id: 'dataset-about',
      label: 'About',
      description: '',
      kind: 'entity',
      propertyUri: 'http://schema.org/about',
      valueName: 'about',
      obligation: 'MAY',
      entityTypes: [target],
    })
    return [root, rule('http://schema.org/Person', 'Person', 'Person')]
  }

  it('names only the class of a class-targeted shape', () => {
    // sh:node would turn the linked shape's warnings into violations.
    const turtle = shapesFromEntityRules(BASICS, withReference('http://schema.org/Person'))

    expect(turtle).toContain('sh:class schema:Person')
    expect(turtle).not.toContain('sh:node ')
  })

  it('keeps sh:node for the untargeted root shape', () => {
    const turtle = shapesFromEntityRules(BASICS, withReference('http://schema.org/Dataset'))

    expect(turtle).toContain('sh:class schema:Dataset ;\n  sh:node <https://w3id.org/aruna/profiles/example#shape-Dataset>')
  })
})
