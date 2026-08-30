import { describe, expect, it } from 'vitest'
import { systemPrompt } from './prompt'

describe('systemPrompt', () => {
  it('names the page the user is looking at right after the route', () => {
    const prompt = systemPrompt({
      route: '/app/datasets/01H',
      page: {
        kind: 'dataset',
        title: 'Water quality 2026',
        facts: { 'document id': '01H', path: 'meta/water.json', group: 'g-1', profile: '', entities: '12' },
      },
    })
    const lines = prompt.split('\n')
    const routeIndex = lines.indexOf('The user is on the route /app/datasets/01H.')

    expect(lines[routeIndex + 1]).toBe(
      'The user is looking at the dataset "Water quality 2026" '
      + '(document id 01H, path meta/water.json, group g-1, entities 12).',
    )
  })

  it('leaves the page out when the view registered none', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).not.toContain('The user is looking at')
    expect(prompt).toContain('The user is on the route /app/assistant.')
  })

  it('names a page without facts or a title', () => {
    const prompt = systemPrompt({ route: '/app/groups', page: { kind: 'groups page', title: '', facts: {} } })

    expect(prompt).toContain('The user is looking at the groups page.')
  })
})
