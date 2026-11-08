import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { uploadName, useVisitUploads } from './useVisitUploads'

interface FakeRequest {
  url: string
  headers: Record<string, string>
  body: unknown
  upload: { onprogress?: (event: { loaded: number }) => void }
  onload?: () => void
  onerror?: () => void
  status: number
  statusText: string
  responseText: string
}

let requests: FakeRequest[] = []
let replies: Array<{ status: number; body: unknown }> = []

class FakeXhr {
  request: FakeRequest = { url: '', headers: {}, body: null, upload: {}, status: 0, statusText: '', responseText: '' }
  upload = this.request.upload
  set onload(handler: () => void) { this.request.onload = handler }
  set onerror(handler: () => void) { this.request.onerror = handler }
  set onabort(_: () => void) {}
  get status() { return this.request.status }
  get statusText() { return this.request.statusText }
  get responseText() { return this.request.responseText }
  open(_method: string, url: string) { this.request.url = url }
  setRequestHeader(name: string, value: string) { this.request.headers[name] = value }
  send(body: unknown) {
    this.request.body = body
    requests.push(this.request)
    const reply = replies.shift() ?? { status: 201, body: {} }
    queueMicrotask(() => {
      this.request.upload.onprogress?.({ loaded: 5 })
      Object.assign(this.request, { status: reply.status, responseText: JSON.stringify(reply.body) })
      this.request.onload?.()
    })
  }
}

const visit = <T>(call: (token: string, base: string) => Promise<T>) => call('v1', 'https://node.test/api/v1')
const file = (name: string, path = '', type = 'application/pdf') =>
  Object.defineProperty(new File(['x'.repeat(10)], name, { type }), 'webkitRelativePath', { value: path })

beforeEach(() => {
  requests = []
  replies = []
  vi.stubGlobal('window', { location: { origin: 'https://portal.test' } })
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => vi.unstubAllGlobals())

describe('useVisitUploads', () => {
  it('keeps the folder path of a dropped file below the folder on screen', () => {
    expect(uploadName('plots/', file('a.png', 'run/a.png'))).toBe('plots/run/a.png')
    expect(uploadName('', file('a.png'))).toBe('a.png')
  })

  it('sends files one after another with the visit token and keeps the name a taken one got', async () => {
    replies.push({ status: 201, body: { name: 'report (1).pdf', size: 10 } }, { status: 201, body: { name: 'b.txt', size: 10 } })
    const landed = vi.fn()
    const { uploads, add } = useVisitUploads(visit, landed)

    await add('', [file('report.pdf'), file('b.txt', '', '')])

    expect(requests.map((request) => request.url)).toEqual([
      'https://node.test/api/v1/shares/visit/uploads?name=report.pdf',
      'https://node.test/api/v1/shares/visit/uploads?name=b.txt',
    ])
    expect(requests[0].headers).toEqual({ Authorization: 'Share v1', 'Content-Type': 'application/pdf' })
    expect(requests[1].headers['Content-Type']).toBe('application/octet-stream')
    expect(uploads.value.map((entry) => [entry.state, entry.landed, entry.sent])).toEqual([
      ['done', 'report (1).pdf', 10],
      ['done', 'b.txt', 10],
    ])
    expect(landed).toHaveBeenCalledTimes(2)
  })

  it('sends a file once more when another writer took its name meanwhile, and only once', async () => {
    replies.push(
      { status: 409, body: { error: 'taken', code: 'name_taken' } },
      { status: 201, body: { name: 'a (1).txt', size: 10 } },
      { status: 409, body: { error: 'taken', code: 'name_taken' } },
      { status: 409, body: { error: 'taken', code: 'name_taken' } },
    )
    const { uploads, add } = useVisitUploads(visit)

    await add('', [file('a.txt'), file('b.txt')])

    expect(requests).toHaveLength(4)
    expect(uploads.value[0]).toMatchObject({ state: 'done', landed: 'a (1).txt' })
    expect(uploads.value[1]).toMatchObject({ state: 'failed', error: 'Another upload took this name. Send the file again.' })
  })

  it('names a full group storage and goes on with the next file', async () => {
    replies.push({ status: 409, body: { error: 'quota exhausted' } }, { status: 201, body: { name: 'b.txt', size: 10 } })
    const { uploads, add } = useVisitUploads(visit)

    await add('', [file('a.txt'), file('b.txt')])

    expect(uploads.value[0]).toMatchObject({ state: 'failed', error: 'The storage of this group is full.' })
    expect(uploads.value[1].state).toBe('done')
  })

  it('says to try again later when the member taking the name cannot be reached', async () => {
    replies.push({ status: 503, body: { error: 'unreachable', code: 'range_unavailable' } }, { status: 201, body: { name: 'b.txt', size: 10 } })
    const { uploads, add } = useVisitUploads(visit)

    await add('', [file('a.txt'), file('b.txt')])

    expect(uploads.value[0]).toMatchObject({ state: 'failed', error: 'This part of the folder takes no uploads right now. Try again later.' })
    expect(uploads.value[1].state).toBe('done')
  })

  it('says the link ended when the node no longer knows it', async () => {
    const ended = () => Promise.reject(new ApiError(404, 'gone', 'share_unavailable'))
    const { uploads, add } = useVisitUploads(ended as typeof visit)

    await add('', [file('a.txt')])

    expect(uploads.value[0]).toMatchObject({ state: 'failed', error: 'This link does not work.' })
  })
})
