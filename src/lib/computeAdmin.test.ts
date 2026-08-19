import { describe, expect, it } from 'vitest'
import {
  emptyQuotaDraft,
  serializeQuotaDraft,
  validateDirectedLinks,
  type LocationLinkDraft,
} from './computeAdmin'

function link(from: string, to: string): LocationLinkDraft {
  return { from, to, bandwidth: { value: '100', unit: 'MiB' } }
}

describe('compute admin serialization', () => {
  it('omits empty quota dimensions instead of serializing zero', () => {
    const serialized = serializeQuotaDraft(emptyQuotaDraft())
    expect(serialized).toEqual({})
    expect(JSON.stringify(serialized)).not.toContain(':0')
  })

  it('rejects a duplicate directed pair while keeping the reverse direction distinct', () => {
    expect(validateDirectedLinks([link('eu', 'us'), link(' eu ', 'us')])).toContain(
      'The directed link eu to us appears twice.',
    )
    expect(validateDirectedLinks([link('eu', 'us'), link('us', 'eu')])).toEqual([])
  })
})
