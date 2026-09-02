// Answers the API calls the profile tutorial's surfaces make: the profiles
// listing, the profile's own crate, the draft check, and the two creates. A
// path this table does not know is handed back to the client, which forwards a
// read and refuses a write, so an active session never changes anything.
import type { ApiInterceptor } from '../interceptor'
import type { ApiRequestOptions, MetadataDocumentListItem } from '@/lib/api'
import {
  TUTORIAL_PROFILE_DOC_ID,
  tutorialDatasetItem,
  tutorialProfileCrate,
  tutorialProfileItem,
} from '../fixtures/profile'
import { tutorialPreview } from './tutorialPreview'

const PREVIEW_PATH = '/metadata/profile/validation/preview'
const PROFILE_PREFIX = 'profiles/'

export interface TutorialProfileApi {
  api: ApiInterceptor
  /** Puts the fixtures back: the practice profile is uncreated again. */
  reset(): void
  /** True once the builder's simulated create was answered. */
  created(): boolean
}

function body(options: ApiRequestOptions): Record<string, unknown> {
  if (typeof options.body !== 'string') return {}
  try {
    const parsed = JSON.parse(options.body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function page(documents: MetadataDocumentListItem[]) {
  return { documents, limit: 100, offset: 0, total_returned: documents.length }
}

/** One session's fixtures, owned by the group the reader is working in. */
export function tutorialProfileApi(groupId: () => string): TutorialProfileApi {
  // The practice profile exists only after the builder's Create was answered,
  // so the dataset editor's picker shows it arriving rather than being there.
  let profileCreated = false

  const api: ApiInterceptor = (path, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase()

    if (path === PREVIEW_PATH && method === 'POST') {
      return tutorialPreview(body(options).rocrate)
    }

    if (path === '/metadata') {
      if (method !== 'POST') {
        const prefix = String(options.query?.path_prefix ?? '')
        const listed = prefix.startsWith(PROFILE_PREFIX) && profileCreated
          ? [tutorialProfileItem(groupId())]
          : []
        return Promise.resolve(page(listed))
      }
      const requested = String(body(options).path ?? '')
      if (requested.startsWith(PROFILE_PREFIX)) {
        profileCreated = true
        return Promise.resolve(tutorialProfileItem(groupId()))
      }
      return Promise.resolve(tutorialDatasetItem(groupId(), requested))
    }

    if (path.startsWith('/metadata/')) {
      const rest = decodeURIComponent(path.slice('/metadata/'.length))
      const documentId = rest.replace(/\/rocrate$/, '')
      if (documentId !== TUTORIAL_PROFILE_DOC_ID) return null
      if (rest.endsWith('/rocrate')) return Promise.resolve({ rocrate: tutorialProfileCrate() })
      const { rocrate_summary: _summary, ...summary } = tutorialProfileItem(groupId())
      return Promise.resolve(summary)
    }

    // The practice profile is never published, so nothing is staged for it.
    if (path === '/data/staging/references') return Promise.resolve({ entries: [] })

    return null
  }

  return {
    api,
    reset: () => {
      profileCreated = false
    },
    created: () => profileCreated,
  }
}
