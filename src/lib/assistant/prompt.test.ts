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

  it('gives the user and active group ids so they are not re-queried', () => {
    const prompt = systemPrompt({
      route: '/app/buckets',
      identity: { userId: 'u-1@realm', realmId: 'r-1', groupId: 'g-1', groupName: 'Marine Genomics Lab' },
    })

    expect(prompt).toContain(
      'Use these ids directly instead of looking them up: the signed-in user is u-1@realm, '
      + 'the active realm is r-1, the active group is g-1 (Marine Genomics Lab).',
    )
  })

  it('omits the identity line when no user is set', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).not.toContain('Use these ids directly')
  })

  it('asks for clear Markdown and the show_ tools', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain('short Markdown')
    expect(prompt).toContain('never dump raw JSON')
  })

  it('tells the model a denial is final', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      "A denied tool call is the user's decision: do not retry it, say what was denied and ask what should change.",
    )
  })

  it('tells the model how to build a dataset from a bucket', () => {
    const prompt = systemPrompt({ route: '/app/assistant' })

    expect(prompt).toContain(
      'To build a dataset from a bucket, inventory it first: list_objects with the prefix, '
      + 'following next_cursor until it is absent.',
    )
    expect(prompt).toContain(
      'Derive what the data supports: read README, LICENSE, CITATION.cff and similar text objects, '
      + 'and use the file names; say where each suggestion came from.',
    )
    expect(prompt).toContain(
      'Ask once, in one compact message, for what the data cannot answer: name, description, '
      + 'creator or author, license, datePublished, keywords, and the profile.',
    )
    expect(prompt).toContain('Offer a suggested value beside each field so the user can accept or edit it.')
    expect(prompt).toContain(
      'Never invent a person, an organization, an identifier, a license or a date; ask instead, once.',
    )
    expect(prompt).toContain(
      'A field the user declines stays absent; optional fields are never a reason to ask again.',
    )
    expect(prompt).toContain('Show the planned crate with show_crate and validate it before anything is created.')
    expect(prompt).toContain(
      'Call create_dataset only after the user confirms; in the dataset editor use the editor tools '
      + 'and let the user save.',
    )
  })

  it('states the realm totals when they are known', () => {
    const prompt = systemPrompt({
      route: '/app',
      realm: { datasets: 12, profiles: 3, groups: 5, nodesOnline: '2 / 4', objects: 40, buckets: 6 },
    })

    expect(prompt).toContain(
      'This realm currently holds 12 datasets, 3 profiles, 5 groups, 40 objects, 6 buckets, with 2 / 4 nodes online.',
    )
    expect(prompt).toContain('answer count questions from them directly')
  })

  it('leaves the realm line out when no totals are given', () => {
    const prompt = systemPrompt({ route: '/app' })

    expect(prompt).not.toContain('This realm currently')
    expect(prompt).not.toContain('answer count questions from them directly')
  })
})
