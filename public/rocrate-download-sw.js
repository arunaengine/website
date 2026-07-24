const downloads = new Map()
const downloadPrefix = new URL(self.registration.scope).pathname

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  const message = event.data
  const port = event.ports[0]
  if (
    message?.type !== 'rocrate-download'
    || typeof message.id !== 'string'
    || !/^[a-f0-9-]{36}$/i.test(message.id)
    || !port
  ) return

  const previous = downloads.get(message.id)
  previous?.port.close()
  downloads.set(message.id, {
    port,
    filename: typeof message.filename === 'string' ? message.filename : 'ro-crate.zip',
    contentType: typeof message.contentType === 'string' ? message.contentType : 'application/zip',
    contentLength: typeof message.contentLength === 'string' && /^\d+$/.test(message.contentLength)
      ? message.contentLength
      : null,
  })
  port.postMessage({ type: 'ready' })
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method !== 'GET'
    || url.origin !== self.location.origin
    || !url.pathname.startsWith(downloadPrefix)
  ) return

  const id = url.pathname.slice(downloadPrefix.length)
  const download = downloads.get(id)
  downloads.delete(id)
  if (!download) {
    event.respondWith(new Response('Download not found.', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    }))
    return
  }

  const { port } = download
  let pending = null
  const body = new ReadableStream({
    start(controller) {
      port.onmessage = ({ data }) => {
        if (data?.type === 'chunk' && data.chunk instanceof ArrayBuffer) {
          controller.enqueue(new Uint8Array(data.chunk))
          pending?.resolve()
          pending = null
        } else if (data?.type === 'end') {
          controller.close()
          pending?.resolve()
          pending = null
          port.postMessage({ type: 'done' })
          port.close()
        } else if (data?.type === 'error') {
          const error = new Error(typeof data.message === 'string' ? data.message : 'Download failed.')
          controller.error(error)
          pending?.reject(error)
          pending = null
          port.close()
        }
      }
    },
    pull() {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
        port.postMessage({ type: 'pull' })
      })
    },
    cancel() {
      port.postMessage({ type: 'cancel' })
      port.close()
    },
  })
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
    'Content-Type': download.contentType,
    'X-Content-Type-Options': 'nosniff',
  })
  if (download.contentLength) headers.set('Content-Length', download.contentLength)
  event.respondWith(new Response(body, { headers }))
})
