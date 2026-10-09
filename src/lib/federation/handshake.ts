// The popup handshake between a realm portal and the home realm portal it opens. Nothing
// travels in the popup URL. The popup announces itself with an empty ready message; the
// opener answers only that popup window at the verified origin, and the popup answers only
// its opener at the origin it locked after checking the opener's signed descriptor.

const PROTOCOL = 'aruna-federation-v1'
const CLOSED_POLL_MS = 500

export type HandshakeFailure = 'blocked' | 'closed' | 'timeout' | 'refused'

export class HandshakeError extends Error {
  constructor(
    public reason: HandshakeFailure,
    message: string,
    /** The node's error code behind a refusal, when the other side named one. */
    public code?: string,
  ) {
    super(message)
    this.name = 'HandshakeError'
  }
}

interface Envelope {
  protocol: typeof PROTOCOL
  type: 'ready' | 'request' | 'result' | 'error'
  id?: number
  body?: unknown
}

function envelope(data: unknown): Envelope | null {
  if (!data || typeof data !== 'object') return null
  const message = data as Partial<Envelope>
  if (message.protocol !== PROTOCOL || typeof message.type !== 'string') return null
  return message as Envelope
}

/** A refusal body: the message, or the message with the node's error code. */
function refusal(body: unknown): HandshakeError {
  if (typeof body === 'string') return new HandshakeError('refused', body)
  const { message, code } = (body ?? {}) as { message?: unknown; code?: unknown }
  const text = typeof message === 'string' ? message : 'The other realm refused.'
  return new HandshakeError('refused', text, typeof code === 'string' ? code : undefined)
}

type MessageListener = (event: MessageEvent) => void

/** The parts of `window` the handshake uses, so tests can pass a stand-in. */
export interface HandshakeWindow {
  addEventListener(type: 'message', listener: MessageListener): void
  removeEventListener(type: 'message', listener: MessageListener): void
  open?(url: string, target: string, features: string): Window | null
  opener?: unknown
  close?(): void
}

interface Pending {
  id: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/**
 * The opener side: one popup at one expected origin, asked one request at a time. It opens
 * empty, in the click handler before any await, so the browser lets it through; `navigate`
 * sends it to the checked realm later.
 */
export class PopupChannel {
  private popup: Window
  private origin = ''
  private listener: MessageListener
  private closedTimer: ReturnType<typeof setInterval>
  private deadline: ReturnType<typeof setTimeout>
  private readyWaiters: Array<() => void> = []
  private isReady = false
  private pending: Pending | null = null
  private nextId = 1
  private ended: HandshakeError | null = null

  constructor(
    private host: HandshakeWindow,
    timeoutMs: number,
  ) {
    const popup = host.open?.('about:blank', '_blank', 'popup,width=560,height=760') ?? null
    if (!popup) throw new HandshakeError('blocked', 'The browser blocked the popup. Allow popups for this site.')
    this.popup = popup
    this.listener = (event) => this.receive(event)
    host.addEventListener('message', this.listener)
    this.closedTimer = setInterval(() => {
      if (this.popup.closed) this.end(new HandshakeError('closed', 'The window was closed.'))
    }, CLOSED_POLL_MS)
    this.deadline = setTimeout(
      () => this.end(new HandshakeError('timeout', 'No answer in time.')),
      timeoutMs,
    )
  }

  /** Sends the popup to `url`; from then on only messages from `origin` count. */
  navigate(url: string, origin: string) {
    if (this.ended) throw this.ended
    this.origin = origin
    this.popup.location.replace(url)
  }

  private receive(event: MessageEvent) {
    if (!this.origin || event.source !== this.popup || event.origin !== this.origin) return
    const message = envelope(event.data)
    if (!message) return
    if (message.type === 'ready') {
      this.isReady = true
      for (const wake of this.readyWaiters.splice(0)) wake()
      return
    }
    const pending = this.pending
    if (!pending || message.id !== pending.id) return
    this.pending = null
    if (message.type === 'result') pending.resolve(message.body)
    else if (message.type === 'error') pending.reject(refusal(message.body))
  }

  private waitReady(): Promise<void> {
    if (this.isReady) return Promise.resolve()
    return new Promise((resolve, reject) => {
      if (this.ended) reject(this.ended)
      else this.readyWaiters.push(resolve)
    })
  }

  /** Sends `body` once the popup is ready and resolves with its answer to that request. */
  async ask<T>(body: unknown): Promise<T> {
    if (this.ended) throw this.ended
    if (this.pending) throw new Error('A request is already waiting for an answer.')
    await this.waitReady()
    if (this.ended) throw this.ended
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending = { id, resolve: resolve as (value: unknown) => void, reject }
      this.popup.postMessage({ protocol: PROTOCOL, type: 'request', id, body } satisfies Envelope, this.origin)
    })
  }

  private end(error: HandshakeError) {
    if (this.ended) return
    this.ended = error
    clearInterval(this.closedTimer)
    clearTimeout(this.deadline)
    this.host.removeEventListener('message', this.listener)
    this.pending?.reject(error)
    this.pending = null
    for (const wake of this.readyWaiters.splice(0)) wake()
  }

  /** Ends the flow and closes the popup; later answers are ignored. */
  close() {
    this.end(new HandshakeError('closed', 'The flow ended.'))
    try {
      this.popup.close()
    } catch {
      // A popup that navigated away may refuse; it is no longer listened to.
    }
  }
}

export interface OpenerRequest {
  id: number
  body: unknown
  origin: string
}

/**
 * The popup side. Requests are taken only from `window.opener`; after `lock` only from the
 * locked origin, and every answer goes to exactly that origin. Waiting for a request ends
 * when the opener closes or after `timeoutMs`.
 */
export class OpenerLink {
  private listener: MessageListener
  private locked: string | null = null
  private queue: OpenerRequest[] = []
  private waiter: { resolve: (request: OpenerRequest) => void; reject: (error: Error) => void } | null = null
  private closedTimer: ReturnType<typeof setInterval>
  private deadline: ReturnType<typeof setTimeout>
  private ended: HandshakeError | null = null

  constructor(
    private host: HandshakeWindow,
    timeoutMs: number,
  ) {
    this.listener = (event) => this.receive(event)
    host.addEventListener('message', this.listener)
    this.closedTimer = setInterval(() => {
      const opener = this.host.opener as { closed?: boolean } | null | undefined
      if (!opener || opener.closed) this.end(new HandshakeError('closed', 'The other window was closed.'))
    }, CLOSED_POLL_MS)
    this.deadline = setTimeout(() => this.end(new HandshakeError('timeout', 'No request in time.')), timeoutMs)
  }

  get hasOpener(): boolean {
    return Boolean(this.host.opener)
  }

  /** False once the opener closed, the deadline passed or the link was disposed. */
  get active(): boolean {
    return !this.ended
  }

  /** The empty ready message; it carries nothing, so any origin may see it. */
  announce() {
    const opener = this.host.opener as Window | null | undefined
    opener?.postMessage({ protocol: PROTOCOL, type: 'ready' } satisfies Envelope, '*')
  }

  private receive(event: MessageEvent) {
    if (!this.host.opener || event.source !== this.host.opener) return
    if (this.locked && event.origin !== this.locked) return
    const message = envelope(event.data)
    if (!message || message.type !== 'request' || typeof message.id !== 'number') return
    const request = { id: message.id, body: message.body, origin: event.origin }
    if (this.waiter) {
      const wake = this.waiter
      this.waiter = null
      wake.resolve(request)
    } else this.queue.push(request)
  }

  /** The next request; rejects with a `HandshakeError` once the link ended. */
  next(): Promise<OpenerRequest> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    if (this.ended) return Promise.reject(this.ended)
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject }
    })
  }

  private end(error: HandshakeError) {
    if (this.ended) return
    this.ended = error
    clearInterval(this.closedTimer)
    clearTimeout(this.deadline)
    this.host.removeEventListener('message', this.listener)
    this.queue = []
    this.waiter?.reject(error)
    this.waiter = null
  }

  /** Accepts later requests only from `origin`, the verified opener portal. */
  lock(origin: string) {
    this.locked = origin
    this.queue = this.queue.filter((request) => request.origin === origin)
  }

  private send(type: 'result' | 'error', id: number, body: unknown) {
    if (this.ended) return
    if (!this.locked) throw new Error('The opener origin is not verified.')
    const opener = this.host.opener as Window | null | undefined
    opener?.postMessage({ protocol: PROTOCOL, type, id, body } satisfies Envelope, this.locked)
  }

  reply(request: OpenerRequest, body: unknown) {
    this.send('result', request.id, body)
  }

  refuse(request: OpenerRequest, message: string, code?: string) {
    this.send('error', request.id, code ? { message, code } : message)
  }

  dispose() {
    this.end(new HandshakeError('closed', 'The flow ended.'))
  }
}
