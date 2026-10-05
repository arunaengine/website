import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import { getBucketEncryption } from '@/lib/api'
import { bucketUnlockLink, keyGenerations } from '@/lib/bucketEncryption'
import { formatBytes } from '@/lib/utils'
import { hasReferenceMetadata } from '@/lib/references'
import { authToken, sessionEpoch, userInfo } from './aruna/state'
import { isS3BucketLockedError } from './s3/errors'
import { localNodeId, nodeApiBase } from './s3/endpoints'
import { s3ErrorMessage, useS3 } from './useS3'

export type PreviewKind = 'text' | 'markdown' | 'table' | 'image' | 'media' | 'pdf' | 'download'
export type MediaKind = 'video' | 'audio'

export interface PreviewTarget {
  bucket: string
  key: string
  size?: number
  contentType?: string
  /** Node hosting the bucket; null/absent = the connected node. */
  nodeId?: string | null
  /** A specific version; absent reads the current one. */
  versionId?: string
}

// Caps applied before any bytes leave the node: an object larger than its
// kind's limit degrades to a download card instead of being pulled into the
// tab's memory.
const TEXT_CAP = 2 * 1024 * 1024
const TABLE_CAP = 20 * 1024 * 1024
const IMAGE_CAP = 25 * 1024 * 1024

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a'])
const MARKDOWN_EXT = new Set(['md', 'markdown'])

// Extension → CodeMirror language token; entries mapped to 'text' render as
// plain read-only text without pulling a syntax package.
const CODE_LANG: Record<string, string> = {
  txt: 'text', text: 'text', log: 'text', ini: 'text', cfg: 'text', conf: 'text',
  properties: 'properties',
  json: 'json', jsonld: 'json', geojson: 'json', ndjson: 'json',
  yaml: 'yaml', yml: 'yaml',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx',
  py: 'python', pyi: 'python',
  rs: 'rust',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  css: 'css',
  xml: 'xml', html: 'xml', htm: 'xml',
  toml: 'toml',
  go: 'go',
  rb: 'ruby',
  java: 'java',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  r: 'r',
  diff: 'diff', patch: 'diff',
  dockerfile: 'dockerfile',
}

// A minified JSON object is unreadable on one line, so the preview stores the
// formatted text instead. Anything that does not parse is left untouched.
export function prettyJson(content: string): string {
  try {
    return `${JSON.stringify(JSON.parse(content), null, 2)}\n`
  } catch {
    return content
  }
}

export interface Classification {
  kind: PreviewKind
  language?: string
}

function extensionOf(key: string): string {
  return key.split('.').pop()?.toLowerCase() ?? ''
}

// Pure extension + ContentType routing; extension wins because a node rarely
// records an accurate ContentType for browsed objects.
export function classifyObject(target: { key: string; contentType?: string }): Classification {
  const ext = extensionOf(target.key)
  const type = (target.contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? ''

  if (ext === 'pdf' || type === 'application/pdf') return { kind: 'pdf' }
  if (MARKDOWN_EXT.has(ext)) return { kind: 'markdown' }
  if (ext === 'csv' || ext === 'tsv') return { kind: 'table' }
  if (IMAGE_EXT.has(ext) || type.startsWith('image/')) return { kind: 'image' }
  if (VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext) || type.startsWith('video/') || type.startsWith('audio/'))
    return { kind: 'media' }
  if (ext in CODE_LANG) return { kind: 'text', language: CODE_LANG[ext] }
  if (type === 'application/json' || type === 'application/ld+json') return { kind: 'text', language: 'json' }
  if (type === 'application/xml' || type === 'text/xml') return { kind: 'text', language: 'xml' }
  if (type.startsWith('text/')) return { kind: 'text', language: 'text' }
  return { kind: 'download' }
}

function mediaSubtype(target: { key: string; contentType?: string }): MediaKind {
  const ext = extensionOf(target.key)
  const type = (target.contentType ?? '').toLowerCase()
  if (AUDIO_EXT.has(ext) || type.startsWith('audio/')) return 'audio'
  return 'video'
}

export function useObjectPreview() {
  const s3 = useS3()

  /** `locked`: the bucket is encrypted and locked, so the content waits for an unlock. */
  const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'locked'>('idle')
  /** `unknown`: the node answered without saying whether encrypted versions remain. */
  const lockCheck = ref<'idle' | 'checking' | 'still' | 'unknown' | 'failed'>('idle')
  const lockedTarget = shallowRef<PreviewTarget | null>(null)
  /** The S3 issuer node the current load reads from when its target omits the node. */
  let issuerNode: string | null = null
  let currentTarget: PreviewTarget | null = null
  // One controller per load: a reset cancels every probe of the load it ends.
  let probes = new AbortController()
  let loadId = 0
  const kind = ref<PreviewKind>('download')
  const language = ref<string | undefined>(undefined)
  const mediaKind = ref<MediaKind>('video')
  const delimiter = ref<string>(',')
  const text = ref<string | null>(null)
  const objectUrl = ref<string | null>(null)
  const directUrl = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  /** A failed download of the current load; it never replaces what the preview shows. */
  const downloadError = ref<string | null>(null)
  const corsBlocked = ref(false)
  const sizeNote = ref<string | null>(null)
  const referenced = ref(false)
  let referenceProbeId = 0
  // Account, session and the S3 session a URL is signed under: issuer node, group, access key
  // and expiry, which a credential refresh moves. A change means reading again.
  const sessionKey = computed(() => {
    const session = s3.activeSession?.value
    return [
      sessionEpoch.value,
      userInfo.value?.user.user_id ?? '',
      session?.issuerNodeId ?? '',
      session?.groupId ?? '',
      session?.accessKeyId ?? '',
      session?.expiresAt ?? '',
    ].join('\u0000')
  })
  /** The session key the current signed URL was made under. */
  let signedUnder = ''

  function reset() {
    probes.abort()
    probes = new AbortController()
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
    status.value = 'idle'
    kind.value = 'download'
    language.value = undefined
    mediaKind.value = 'video'
    delimiter.value = ','
    text.value = null
    objectUrl.value = null
    directUrl.value = null
    errorMessage.value = null
    downloadError.value = null
    corsBlocked.value = false
    sizeNote.value = null
    referenced.value = false
    lockCheck.value = 'idle'
    lockedTarget.value = null
    currentTarget = null
    ++loadId
    ++referenceProbeId
  }

  // Reference marker for buckets the connected node's /data/staging/references
  // listing does not cover (remote-node buckets): a single HeadObject on the
  // previewed object reveals the aruna-* reference metadata. Never throws;
  // the marker simply stays off.
  async function probeReferenced(target: PreviewTarget) {
    const probeId = ++referenceProbeId
    referenced.value = false
    try {
      const head = await s3.headObject(target.bucket, target.key, target.nodeId, target.versionId)
      if (probeId === referenceProbeId) referenced.value = hasReferenceMetadata(head.metadata)
    } catch {
      // Leave the marker off; the preview itself is unaffected.
    }
  }

  /** Switches the preview to waiting for a bucket unlock of `target`. */
  function markLocked(target = currentTarget) {
    if (!target) return
    lockedTarget.value = target
    status.value = 'locked'
  }

  // The signed URL of the current load, only for the same object under the same S3 session. An
  // omitted node (the active session's node) and null (the connected node) stay different.
  function urlFor(target: PreviewTarget): string | null {
    const shown = currentTarget
    if (!shown || !directUrl.value || signedUnder !== sessionKey.value) return null
    const same =
      shown.bucket === target.bucket &&
      shown.key === target.key &&
      shown.nodeId === target.nodeId &&
      (shown.versionId ?? null) === (target.versionId ?? null)
    return same ? directUrl.value : null
  }

  /** The load a request starts in; `isCurrent` turns false once a newer load or a reset begins. */
  const loadToken = () => loadId
  const isCurrent = (id: number) => id === loadId

  // True only while the load is current and no probe of it confirmed a lock. A cancelled probe
  // is never permission; a slow one (`unknown` after its time limit) blocks nothing.
  async function checkAccess(url: string, id: number, target = currentTarget): Promise<boolean> {
    if (id !== loadId) return false
    const signal = probes.signal
    const access = await s3.probeAccess(url, signal)
    if (signal.aborted || id !== loadId) return false
    if (access === 'locked') {
      markLocked(target)
      return false
    }
    return status.value !== 'locked'
  }

  // A result may settle load `id` only while it is current and no probe of it confirmed a lock.
  // Only a reset, and so a recheck or reload, ends a confirmed lock.
  const settles = (id: number) => id === loadId && status.value !== 'locked'

  async function fallbackDownload(target: PreviewTarget, cap: number, actual: number, id: number) {
    kind.value = 'download'
    sizeNote.value = `This file is ${formatBytes(actual)}, above the ${formatBytes(cap)} preview limit.`
    try {
      const signingKey = sessionKey.value
      const url = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
      if (id !== loadId) return
      const open = await checkAccess(url, id, target)
      if (id !== loadId || !open) return
      directUrl.value = url
      signedUnder = signingKey
      status.value = 'ready'
    } catch (err) {
      if (!settles(id)) return
      errorMessage.value = s3ErrorMessage(err)
      status.value = 'error'
    }
  }

  // Every await below is followed by a check of `id`: a newer load owns the state.
  async function load(target: PreviewTarget) {
    reset()
    issuerNode = s3.activeSession?.value?.issuerNodeId ?? null
    const id = loadId
    currentTarget = target
    status.value = 'loading'
    const classified = classifyObject(target)
    kind.value = classified.kind
    language.value = classified.language
    try {
      if (classified.kind === 'media' || classified.kind === 'pdf' || classified.kind === 'download') {
        if (classified.kind === 'media') mediaKind.value = mediaSubtype(target)
        const signingKey = sessionKey.value
        const url = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
        if (id !== loadId) return
        const open = await checkAccess(url, id, target)
        if (id !== loadId || !open) return
        directUrl.value = url
        signedUnder = signingKey
        status.value = 'ready'
        return
      }

      const cap = classified.kind === 'image' ? IMAGE_CAP : classified.kind === 'table' ? TABLE_CAP : TEXT_CAP
      if (typeof target.size === 'number' && target.size > cap) {
        await fallbackDownload(target, cap, target.size, id)
        return
      }

      if (classified.kind === 'image') {
        const blob = await s3.getObjectBlob(target.bucket, target.key, target.nodeId, target.versionId)
        if (!settles(id)) return
        if (blob.size > cap) {
          await fallbackDownload(target, cap, blob.size, id)
          return
        }
        objectUrl.value = URL.createObjectURL(blob)
      } else {
        const content = await s3.getObjectText(target.bucket, target.key, target.nodeId, target.versionId)
        if (!settles(id)) return
        // Coarse guard for objects whose size was not listed up front.
        if (content.length > cap) {
          await fallbackDownload(target, cap, content.length, id)
          return
        }
        text.value = classified.language === 'json' ? prettyJson(content) : content
        if (classified.kind === 'table') delimiter.value = extensionOf(target.key) === 'tsv' ? '\t' : ','
      }
      status.value = 'ready'
    } catch (err) {
      if (id !== loadId) return
      if (isS3BucketLockedError(err)) {
        lockedTarget.value = target
        status.value = 'locked'
        return
      }
      if (!settles(id)) return
      // A cross-origin fetch blocked by bucket CORS (or an offline node) rejects
      // with a TypeError and no response; anything else is a real read error.
      if (err instanceof TypeError) corsBlocked.value = true
      else errorMessage.value = s3ErrorMessage(err)
      try {
        const signingKey = sessionKey.value
        const url = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
        if (settles(id)) {
          directUrl.value = url
          signedUnder = signingKey
        }
      } catch {
        // Leave directUrl null; the pane still offers its own download button.
      }
      if (settles(id)) status.value = 'error'
    }
  }

  // The node a locked bucket was read from: an omitted node is the S3 issuer, null the connected node.
  const nodeOf = (target: PreviewTarget) => (target.nodeId === undefined ? issuerNode : target.nodeId)

  const lockedLink = computed(() =>
    status.value === 'locked' && lockedTarget.value
      ? bucketUnlockLink(lockedTarget.value.bucket, nodeOf(lockedTarget.value))
      : null,
  )

  /** Reads the bucket's lock state on its node and loads again only after an observed unlock. */
  async function recheck(): Promise<void> {
    const target = lockedTarget.value
    if (!target || status.value !== 'locked') return
    const id = loadId
    lockCheck.value = 'checking'
    const node = nodeOf(target) ?? localNodeId()
    const baseUrl = node ? nodeApiBase(node) : null
    try {
      if (!baseUrl) throw new Error('The node publishes no API address.')
      const answer = await getBucketEncryption(target.bucket, { baseUrl, token: authToken.value })
      if (id !== loadId) return
      const { list, reported } = keyGenerations(answer)
      // An unlocked key, or a bucket confirmed plain with no key left, may serve the content now.
      const plain = answer.mode === 'off' && reported && list.length === 0
      if (plain || list.some((key) => key.unlock.state === 'unlocked')) await load(target)
      else lockCheck.value = answer.mode === 'off' && !reported ? 'unknown' : 'still'
    } catch {
      if (id === loadId) lockCheck.value = 'failed'
    }
  }

  // A disposed preview starts nothing new and lets no pending work finish into it.
  if (getCurrentScope()) onScopeDispose(reset)

  return {
    status,
    lockCheck,
    lockedLink,
    recheck,
    markLocked,
    checkAccess,
    loadToken,
    isCurrent,
    sessionKey,
    urlFor,
    kind,
    language,
    mediaKind,
    delimiter,
    text,
    objectUrl,
    directUrl,
    errorMessage,
    downloadError,
    corsBlocked,
    sizeNote,
    referenced,
    load,
    probeReferenced,
    reset,
  }
}
