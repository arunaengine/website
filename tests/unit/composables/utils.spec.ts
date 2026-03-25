import type { v2Permission } from '~/composables/aruna_api_json'
import {
  createS3Key,
  debounce,
  displayDate,
  formatDate,
  getUserCustomAttributes,
  getUserEndpoints,
  getUserPermissions,
  getUserToken,
  isUserAdmin,
  isUserServiceAccount,
  parseJwt,
  prettyDisplayJson,
} from '~/composables/utils'
import { createUser } from '../../helpers/user'

describe('composables/utils', () => {
  const realNavigator = window.navigator
  const enGbDateTime = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: { language: 'en-GB' },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'navigator', {
      configurable: true,
      value: realNavigator,
    })
  })

  it('parses a JWT payload', () => {
    const payload = { sub: 'user-1', exp: 1234 }
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`

    expect(parseJwt(token)).toEqual(payload)
  })

  it('pretty prints valid json', () => {
    expect(prettyDisplayJson('{"hello":"world"}')).toBe('<pre>{\n  "hello": "world"\n}</pre>')
  })

  it('returns original value for invalid json', () => {
    expect(prettyDisplayJson('{hello')).toBe('{hello')
    expect(prettyDisplayJson(undefined)).toBe('')
  })

  it('debounces calls and keeps latest arguments', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    debounced('second')

    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('second')
  })

  it('formats dates using navigator locale', () => {
    const expected = enGbDateTime.format(new Date('2024-01-02T03:04:00.000Z'))
    expect(formatDate('2024-01-02T03:04:00.000Z')).toBe(expected)
  })

  it('marks modified dates when modification is newer', () => {
    const expected = `${enGbDateTime.format(new Date('2024-01-02T03:04:00.000Z'))} (modified)`
    expect(displayDate('2024-01-01T00:00:00.000Z', '2024-01-02T03:04:00.000Z')).toBe(expected)
  })

  it('returns created date when modification is not newer', () => {
    const expected = enGbDateTime.format(new Date('2024-01-02T03:04:00.000Z'))
    expect(displayDate('2024-01-02T03:04:00.000Z', '2024-01-01T00:00:00.000Z')).toBe(expected)
  })

  it('derives user flags and collections with safe fallbacks', () => {
    const permission = { projectId: 'project-1' } as v2Permission
    const user = createUser({
      attributes: {
        globalAdmin: true,
        serviceAccount: true,
        trustedEndpoints: ['endpoint-1'],
        customAttributes: [{ key: 'team', value: 'qa' }],
        personalPermissions: [permission],
        tokens: [{ id: 'token-1' }],
      },
    })

    expect(isUserAdmin(user)).toBe(true)
    expect(isUserServiceAccount(user)).toBe(true)
    expect(getUserEndpoints(user)).toEqual(['endpoint-1'])
    expect(getUserCustomAttributes(user)).toEqual([{ key: 'team', value: 'qa' }])
    expect(getUserPermissions(user)).toEqual([permission])
    expect(getUserToken(user)).toEqual([{ id: 'token-1' }])

    expect(isUserAdmin(undefined)).toBe(false)
    expect(isUserServiceAccount(undefined)).toBe(false)
    expect(getUserEndpoints(undefined)).toEqual([])
    expect(getUserCustomAttributes(undefined)).toEqual([])
    expect(getUserPermissions(undefined)).toEqual([])
    expect(getUserToken(undefined)).toEqual([])
  })

  it('builds S3 keys from optional collection and dataset parts', () => {
    expect(createS3Key(undefined, undefined, 'file.txt')).toBe('file.txt')
    expect(createS3Key('collection', undefined, 'file.txt')).toBe('file.txt')
    expect(createS3Key('collection', 'dataset', 'file.txt')).toBe('collection/dataset/file.txt')
  })
})
