import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storedPageSize, useListPages } from './useListPages'

const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})

describe('listing pages', () => {
  it('keeps the token of every page so Prev lists the one before', () => {
    const pages = useListPages()
    expect(pages.page.value).toBe(1)
    expect(pages.token.value).toBeUndefined()
    expect(pages.next()).toBe(false)

    pages.nextToken.value = 't2'
    expect(pages.next()).toBe(true)
    pages.nextToken.value = 't3'
    expect(pages.next()).toBe(true)
    expect(pages.page.value).toBe(3)
    expect(pages.token.value).toBe('t3')

    expect(pages.previous()).toBe(true)
    expect(pages.page.value).toBe(2)
    expect(pages.token.value).toBe('t2')
    expect(pages.previous()).toBe(true)
    expect(pages.token.value).toBeUndefined()
    expect(pages.previous()).toBe(false)
  })

  it('starts again at the first page when the size changes', () => {
    const pages = useListPages()
    pages.nextToken.value = 't2'
    pages.next()

    pages.setPageSize(100)

    expect(pages.page.value).toBe(1)
    expect(pages.pageSize.value).toBe(100)
    expect(storedPageSize()).toBe(100)
  })

  it('defaults to 25 and ignores a size it does not offer', () => {
    expect(storedPageSize()).toBe(25)
    values.set('aruna.data.pageSize', '7')
    expect(storedPageSize()).toBe(25)

    const pages = useListPages()
    pages.setPageSize(7)
    expect(pages.pageSize.value).toBe(25)
  })
})
