import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, type ListMetadataResponse, type ProfileValidationPreviewResponse } from '@/lib/api'
import {
  TUTORIAL_PROFILE_DOC_ID,
  TUTORIAL_PROFILE_PATH,
  TUTORIAL_PROFILE_SHAPES,
} from '../fixtures/profile'
import { exitTutorial, startTutorial } from '../session'
import { tutorialProfileApi, type TutorialProfileApi } from './tutorialProfileApi'

const GROUP = 'group-of-the-reader'
const fetchSpy = vi.fn()
let fixtures: TutorialProfileApi

const STEP = { id: 'a', route: '/app', target: 't', title: 'T', body: 'b', advanceOn: 'next' } as const

function crate(root: Record<string, unknown>, ...rest: Record<string, unknown>[]) {
  return {
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset', ...root },
      ...rest,
    ],
  }
}

const person = { '@id': '#creator', '@type': 'Person', name: 'Ada Lovelace' }
const complete = {
  name: 'Station survey 2026',
  description: 'Readings from two stations.',
  datePublished: '2026-01-15',
  license: { '@id': 'https://creativecommons.org/licenses/by/4.0/' },
  creator: { '@id': '#creator' },
}

function check(rocrate: unknown): Promise<ProfileValidationPreviewResponse> {
  return apiRequest<ProfileValidationPreviewResponse>('/metadata/profile/validation/preview', {
    method: 'POST',
    body: JSON.stringify({ rocrate, group_id: GROUP }),
  })
}

function profiles(): Promise<ListMetadataResponse> {
  return apiRequest<ListMetadataResponse>('/metadata', { query: { path_prefix: 'profiles/' } })
}

function createProfile() {
  return apiRequest('/metadata', {
    method: 'POST',
    body: JSON.stringify({ group_id: GROUP, path: TUTORIAL_PROFILE_PATH, rocrate: {} }),
  })
}

beforeEach(() => {
  exitTutorial()
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  fixtures = tutorialProfileApi(() => GROUP)
  startTutorial({ id: 'profile', steps: [STEP], api: fixtures.api })
})

afterEach(() => {
  exitTutorial()
  vi.unstubAllGlobals()
})

describe('tutorial profile API', () => {
  it('serves every route it owns without reaching the network', async () => {
    expect((await profiles()).documents).toEqual([])

    const created = await createProfile() as { document_id: string; group_id: string }
    expect(created.document_id).toBe(TUTORIAL_PROFILE_DOC_ID)
    expect(created.group_id).toBe(GROUP)

    const listed = await profiles()
    expect(listed.documents.map((document) => document.document_path)).toEqual([TUTORIAL_PROFILE_PATH])

    const rocrate = await apiRequest<{ rocrate: unknown }>(`/metadata/${TUTORIAL_PROFILE_DOC_ID}/rocrate`)
    expect(JSON.stringify(rocrate.rocrate)).toContain('sh:NodeShape')

    const summary = await apiRequest<{ document_id: string }>(`/metadata/${TUTORIAL_PROFILE_DOC_ID}`)
    expect(summary.document_id).toBe(TUTORIAL_PROFILE_DOC_ID)

    const dataset = await apiRequest('/metadata', {
      method: 'POST',
      body: JSON.stringify({ group_id: GROUP, path: 'surveys/station-2026', rocrate: {} }),
    }) as { document_path: string }
    expect(dataset.document_path).toBe('surveys/station-2026')

    const references = await apiRequest<{ entries: unknown[] }>('/data/staging/references')
    expect(references.entries).toEqual([])

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('carries the profile rules as SHACL', () => {
    expect(TUTORIAL_PROFILE_SHAPES).toContain('sh:targetClass schema:Person')
    expect(TUTORIAL_PROFILE_SHAPES).toContain('sh:path schema:creator')
  })

  it('flips the verdict with the data it is given', async () => {
    const empty = await check(crate({}))
    expect(empty.accepted).toBe(false)
    expect(empty.state).toBe('invalid')
    expect(empty.findings.map((finding) => finding.path)).toEqual([
      'schema:name',
      'schema:description',
      'schema:datePublished',
      'schema:license',
      'schema:creator',
    ])

    // A blank value is not an answer: the row exists but says nothing.
    const blank = await check(crate({ ...complete, description: '   ' }, person))
    expect(blank.accepted).toBe(false)
    expect(blank.findings.map((finding) => finding.path)).toEqual(['schema:description'])

    // The referenced Person is checked too, on its own rules.
    const namelessPerson = await check(crate(complete, { ...person, name: '' }))
    expect(namelessPerson.accepted).toBe(false)
    expect(namelessPerson.findings[0].focus_node).toBe('#creator')

    const accepted = await check(crate(complete, person))
    expect(accepted.accepted).toBe(true)
    expect(accepted.state).toBe('valid')
    expect(accepted.findings).toEqual([])
    expect(accepted.profile_id).toBe(TUTORIAL_PROFILE_DOC_ID)

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lists the profile once it is marked created', async () => {
    // The editor stage reached through the card still needs the profile.
    fixtures.ensureCreated()
    const listed = await apiRequest<{ documents: unknown[] }>('/metadata', { query: { path_prefix: 'profiles/' } })
    expect(listed.documents).toHaveLength(1)
    expect(fixtures.created()).toBe(true)
  })

  it('forgets the created profile on a reset', async () => {
    await createProfile()
    expect(fixtures.created()).toBe(true)

    fixtures.reset()

    expect(fixtures.created()).toBe(false)
    expect((await profiles()).documents).toEqual([])
  })

  it('refuses a write it does not serve and never sends it', async () => {
    const refused = apiRequest('/access/groups', { method: 'POST', body: '{}' })

    await expect(refused).rejects.toMatchObject({ code: 'tutorial_write' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hands a read it does not serve to the real client', async () => {
    // No window here, so the real client fails before fetch; what matters is
    // that the tutorial did not answer it.
    await expect(apiRequest('/access/users/me')).rejects.not.toMatchObject({ code: 'tutorial_write' })
  })
})
