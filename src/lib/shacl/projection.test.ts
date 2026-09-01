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
