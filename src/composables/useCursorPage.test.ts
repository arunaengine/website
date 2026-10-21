import { describe, expect, it, vi } from 'vitest'
import { useCursorPage } from './useCursorPage'

function pages() {
  const fetchPage = vi.fn(async (query: { filter: string; limit: number; after: string | null }) => {
    const index = query.after === null ? 0 : Number(query.after)
    return { items: [`${query.filter}p${index}`], total: 3, complete: true, next: index < 2 ? String(index + 1) : null }
  })
  return { fetchPage, list: useCursorPage<string>(fetchPage) }
}

describe('useCursorPage', () => {
  it('walks forward by cursor and back by the cursors it kept', async () => {
    const { fetchPage, list } = pages()
    await list.load('')
    expect(list.items.value).toEqual(['p0'])
    expect(list.hasPrev.value).toBe(false)
    await list.next()
    await list.next()
    expect(list.items.value).toEqual(['p2'])
    expect(list.hasNext.value).toBe(false)
    expect(list.offset.value).toBe(2)
    await list.prev()
    expect(list.items.value).toEqual(['p1'])
    expect(fetchPage).toHaveBeenLastCalledWith({ filter: '', limit: 100, after: '1' })
  })

  it('starts over with a new filter', async () => {
    const { list } = pages()
    await list.load('')
    await list.next()
    await list.load('faa')
    expect(list.items.value).toEqual(['faap0'])
    expect(list.offset.value).toBe(0)
  })

  it('ignores an answer after a reset and reports a missing route', async () => {
    let late: (value: unknown) => void = () => {}
    const slow = useCursorPage<string>(() => new Promise((resolve) => (late = resolve as typeof late)) as never)
    const pending = slow.load('')
    slow.reset()
    late({ items: ['x'], total: 1, complete: true })
    await pending
    expect(slow.page.value).toBeNull()

    const missing = vi.fn()
    const gone = useCursorPage<string>(async () => Promise.reject({ status: 404 }), missing)
    await gone.load('')
    expect(missing).toHaveBeenCalled()
    expect(gone.error.value).toBeNull()
  })

  it('keeps the page and the cursors when a filter load fails', async () => {
    const { fetchPage, list } = pages()
    await list.load('')
    await list.next()
    fetchPage.mockRejectedValueOnce(new Error('boom'))
    await list.load('faa')
    expect(list.error.value).toBe('boom')
    expect(list.items.value).toEqual(['p1'])
    expect(list.filter.value).toBe('')
    expect(list.offset.value).toBe(1)
    await list.prev()
    expect(list.items.value).toEqual(['p0'])
  })

  it('counts the real size of each page for the offset', async () => {
    const sizes = [3, 2]
    const list = useCursorPage<string>(async (query) => {
      const index = query.after === null ? 0 : Number(query.after)
      return { items: Array(sizes[index]).fill('x'), total: 5, complete: true, next: index === 0 ? '1' : null }
    })
    await list.load('')
    await list.next()
    expect(list.offset.value).toBe(3)
  })
})
