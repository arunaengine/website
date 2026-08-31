import { describe, expect, it } from 'vitest'
import { apiSpecUrl } from './apiSpec'

describe('openapi spec url', () => {
  it('stays same-origin', () => {
    // The default "/api/v1" base means one listener serves portal and API.
    expect(apiSpecUrl('/api/v1')).toBe('/api-docs/openapi.json')
    expect(apiSpecUrl('')).toBe('/api-docs/openapi.json')
  })

  it('uses the api origin', () => {
    expect(apiSpecUrl('https://node.example.org/api/v1')).toBe('https://node.example.org/api-docs/openapi.json')
    expect(apiSpecUrl('http://127.0.0.1:8080/api/v1/')).toBe('http://127.0.0.1:8080/api-docs/openapi.json')
  })

  it('survives a bad base', () => {
    expect(apiSpecUrl('http://')).toBe('/api-docs/openapi.json')
  })
})
