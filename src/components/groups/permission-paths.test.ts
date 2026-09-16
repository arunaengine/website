import { describe, expect, it } from 'vitest'
import { pathProblem } from './permission-paths'

describe('permission path namespaces', () => {
  it('accepts the authorized namespaces', () => {
    for (const suffix of ['**', 'data/**', 'data/node-a/bucket/**', 'meta/reports/**', 'admin/**', '/meta']) {
      expect(pathProblem(suffix)).toBeNull()
    }
  })

  it('flags a path the node never authorizes', () => {
    // A rule beside data/, meta/ and admin/ is stored but matches no request,
    // so a member holding only that rule gets no S3 session.
    expect(pathProblem('testy')).toContain('"testy" grants nothing')
    expect(pathProblem('datasets/**')).toContain('must start with data/, meta/ or admin/')
  })
})
