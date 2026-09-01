import { ref } from 'vue'
import { formatBytes } from '@/lib/utils'
import { hasReferenceMetadata } from '@/lib/references'
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

  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const kind = ref<PreviewKind>('download')
  const language = ref<string | undefined>(undefined)
  const mediaKind = ref<MediaKind>('video')
  const delimiter = ref<string>(',')
  const text = ref<string | null>(null)
  const objectUrl = ref<string | null>(null)
  const directUrl = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const corsBlocked = ref(false)
  const sizeNote = ref<string | null>(null)
  const referenced = ref(false)
  let referenceProbeId = 0

  function reset() {
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
    corsBlocked.value = false
    sizeNote.value = null
    referenced.value = false
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

  async function fallbackDownload(target: PreviewTarget, cap: number, actual: number) {
    kind.value = 'download'
    sizeNote.value = `This file is ${formatBytes(actual)}, above the ${formatBytes(cap)} preview limit.`
    try {
      directUrl.value = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
      status.value = 'ready'
    } catch (err) {
      errorMessage.value = s3ErrorMessage(err)
      status.value = 'error'
    }
  }

  async function load(target: PreviewTarget) {
    reset()
    status.value = 'loading'
    const classified = classifyObject(target)
    kind.value = classified.kind
    language.value = classified.language
    try {
      if (classified.kind === 'media' || classified.kind === 'pdf' || classified.kind === 'download') {
        if (classified.kind === 'media') mediaKind.value = mediaSubtype(target)
        directUrl.value = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
        status.value = 'ready'
        return
      }

      const cap = classified.kind === 'image' ? IMAGE_CAP : classified.kind === 'table' ? TABLE_CAP : TEXT_CAP
      if (typeof target.size === 'number' && target.size > cap) {
        await fallbackDownload(target, cap, target.size)
        return
      }

      if (classified.kind === 'image') {
        const blob = await s3.getObjectBlob(target.bucket, target.key, target.nodeId, target.versionId)
        if (blob.size > cap) {
          await fallbackDownload(target, cap, blob.size)
          return
        }
        objectUrl.value = URL.createObjectURL(blob)
      } else {
        const content = await s3.getObjectText(target.bucket, target.key, target.nodeId, target.versionId)
        // Coarse guard for objects whose size was not listed up front.
        if (content.length > cap) {
          await fallbackDownload(target, cap, content.length)
          return
        }
        text.value = content
        if (classified.kind === 'table') delimiter.value = extensionOf(target.key) === 'tsv' ? '\t' : ','
      }
      status.value = 'ready'
    } catch (err) {
      // A cross-origin fetch blocked by bucket CORS (or an offline node) rejects
      // with a TypeError and no response; anything else is a real read error.
      if (err instanceof TypeError) corsBlocked.value = true
      else errorMessage.value = s3ErrorMessage(err)
      try {
        directUrl.value = await s3.downloadUrl(target.bucket, target.key, target.nodeId, target.versionId)
      } catch {
        // Leave directUrl null; the pane still offers its own download button.
      }
      status.value = 'error'
    }
  }

  return {
    status,
    kind,
    language,
    mediaKind,
    delimiter,
    text,
    objectUrl,
    directUrl,
    errorMessage,
    corsBlocked,
    sizeNote,
    referenced,
    load,
    probeReferenced,
    reset,
  }
}
