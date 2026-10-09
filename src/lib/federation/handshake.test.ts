import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HandshakeError, OpenerLink, PopupChannel, type HandshakeWindow } from './handshake'

const PROTOCOL = 'aruna-federation-v1'
const HOME = 'https://data.giessen.example'
const SERVING = 'https://archive.marburg.example'

function fakeWindow(extra: Partial<HandshakeWindow> = {}) {
  const listeners = new Set<(event: MessageEvent) => void>()
  const host = {
    addEventListener: (_: 'message', listener: (event: MessageEvent) => void) => void listeners.add(listener),
    removeEventListener: (_: 'message', listener: (event: MessageEvent) => void) => void listeners.delete(listener),
    ...extra,
  }
  const deliver = (source: unknown, origin: string, data: unknown) => {
    for (const listener of [...listeners]) listener({ source, origin, data } as MessageEvent)
  }
  return { host, deliver, listeners }
}

function fakePopup() {
  return { closed: false, postMessage: vi.fn(), close: vi.fn() }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('PopupChannel', () => {
  function open() {
    const popup = fakePopup()
    const { host, deliver, listeners } = fakeWindow({ open: vi.fn(() => popup as unknown as Window) })
    const channel = new PopupChannel(host, `${HOME}/federation/popup`, HOME, 60_000)
    return { popup, deliver, listeners, channel }
  }

  it('sends the request only after the popup is ready, to its exact origin', async () => {
    const { popup, deliver, channel } = open()
    const answer = channel.ask<string>({ kind: 'login' })
    await Promise.resolve()
    expect(popup.postMessage).not.toHaveBeenCalled()
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'ready' })
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce())
    const [message, origin] = popup.postMessage.mock.calls[0]
    expect(origin).toBe(HOME)
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'result', id: message.id, body: 'handoff' })
    await expect(answer).resolves.toBe('handoff')
  })

  it('ignores messages from another origin or window and stale answers', async () => {
    const { popup, deliver, channel } = open()
    const answer = channel.ask<string>({ kind: 'login' })
    deliver(popup, 'https://evil.example', { protocol: PROTOCOL, type: 'ready' })
    deliver({}, HOME, { protocol: PROTOCOL, type: 'ready' })
    await Promise.resolve()
    expect(popup.postMessage).not.toHaveBeenCalled()
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'ready' })
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce())
    const id = popup.postMessage.mock.calls[0][0].id
    deliver({}, HOME, { protocol: PROTOCOL, type: 'result', id, body: 'forged' })
    deliver(popup, 'https://evil.example', { protocol: PROTOCOL, type: 'result', id, body: 'forged' })
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'result', id: id + 7, body: 'stale' })
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'result', id, body: 'real' })
    await expect(answer).resolves.toBe('real')
  })

  it('ends when the popup closes and stops listening', async () => {
    const { popup, listeners, channel } = open()
    const answer = channel.ask({ kind: 'login' })
    popup.closed = true
    vi.advanceTimersByTime(600)
    await expect(answer).rejects.toMatchObject({ reason: 'closed' })
    expect(listeners.size).toBe(0)
  })

  it('ends after the timeout', async () => {
    const { channel } = open()
    const answer = channel.ask({ kind: 'login' })
    vi.advanceTimersByTime(60_001)
    await expect(answer).rejects.toMatchObject({ reason: 'timeout' })
  })

  it('reports a refusal from the popup', async () => {
    const { popup, deliver, channel } = open()
    const answer = channel.ask({ kind: 'login' })
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'ready' })
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce())
    const id = popup.postMessage.mock.calls[0][0].id
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'error', id, body: 'Not allowed.' })
    await expect(answer).rejects.toThrow('Not allowed.')
  })

  it('keeps the error code of a refusal', async () => {
    const { popup, deliver, channel } = open()
    const answer = channel.ask({ kind: 'push' })
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'ready' })
    await vi.waitFor(() => expect(popup.postMessage).toHaveBeenCalledOnce())
    const id = popup.postMessage.mock.calls[0][0].id
    const body = { message: 'Cannot reach it.', code: 'push_unreachable' }
    deliver(popup, HOME, { protocol: PROTOCOL, type: 'error', id, body })
    await expect(answer).rejects.toMatchObject({ reason: 'refused', message: 'Cannot reach it.', code: 'push_unreachable' })
  })

  it('reports a blocked popup', () => {
    const { host } = fakeWindow({ open: () => null })
    expect(() => new PopupChannel(host, HOME, HOME, 1000)).toThrow(HandshakeError)
  })
})

describe('OpenerLink', () => {
  function link() {
    const opener = fakePopup()
    const { host, deliver } = fakeWindow({ opener })
    return { opener, deliver, link: new OpenerLink(host, 60_000) }
  }

  it('stops waiting when the opener closes', async () => {
    const { opener, link: popup } = link()
    const waiting = popup.next()
    opener.closed = true
    vi.advanceTimersByTime(600)
    await expect(waiting).rejects.toMatchObject({ reason: 'closed' })
    await expect(popup.next()).rejects.toMatchObject({ reason: 'closed' })
  })

  it('stops waiting after the deadline', async () => {
    const { link: popup } = link()
    const waiting = popup.next()
    vi.advanceTimersByTime(60_001)
    await expect(waiting).rejects.toMatchObject({ reason: 'timeout' })
  })

  it('announces readiness without a payload', () => {
    const { opener, link: popup } = link()
    popup.announce()
    expect(opener.postMessage).toHaveBeenCalledWith({ protocol: PROTOCOL, type: 'ready' }, '*')
  })

  it('takes requests only from the opener and answers the locked origin', async () => {
    const { opener, deliver, link: popup } = link()
    deliver({}, SERVING, { protocol: PROTOCOL, type: 'request', id: 1, body: 'from elsewhere' })
    deliver(opener, SERVING, { protocol: PROTOCOL, type: 'request', id: 2, body: 'from opener' })
    const request = await popup.next()
    expect(request.body).toBe('from opener')
    expect(() => popup.reply(request, 'x')).toThrow('not verified')
    popup.lock(SERVING)
    popup.reply(request, 'answer')
    expect(opener.postMessage).toHaveBeenCalledWith({ protocol: PROTOCOL, type: 'result', id: 2, body: 'answer' }, SERVING)
    popup.refuse(request, 'No.', 'push_refused')
    const body = { message: 'No.', code: 'push_refused' }
    expect(opener.postMessage).toHaveBeenLastCalledWith({ protocol: PROTOCOL, type: 'error', id: 2, body }, SERVING)
  })

  it('drops requests from another origin after locking', async () => {
    const { opener, deliver, link: popup } = link()
    popup.lock(SERVING)
    deliver(opener, 'https://evil.example', { protocol: PROTOCOL, type: 'request', id: 3, body: 'evil' })
    deliver(opener, SERVING, { protocol: PROTOCOL, type: 'request', id: 4, body: 'good' })
    expect((await popup.next()).body).toBe('good')
  })
})
