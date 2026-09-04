// Stored object paths the assistant writes in prose, turned into links into the
// data browser. Fenced and indented code blocks are never touched.
import type { MarkdownIt, StateCore, Token } from 'markdown-it'
import { bucketNameProblem, objectKeyProblem } from '@/lib/bucketName'
import { isKnownBucket } from '@/lib/knownBuckets'

export interface ObjectRef {
  bucket: string
  key: string
}

const S3_PREFIX = 's3://'
// A bare path only reads as an object when its last segment carries a file
// extension, so ordinary words with a slash stay plain text.
const FILE_SUFFIX = /\.[A-Za-z0-9]{1,8}$/
const CANDIDATE = String.raw`(?<![\w/:.-])(?:s3:\/\/)?[A-Za-z0-9][\w.-]*(?:\/[^\s\`'"<>()[\]{}]+)?`
const TRAILING = /[.,;:!?)\]}'"]+$/

const FILE_NAME = /^[A-Za-z0-9][\w.-]{0,180}\.([A-Za-z0-9]{1,8})$/
// A bare word only reads as a file name when it ends in an extension files in
// a bucket carry. `js` and `ts` are left out: they read as Node.js far more
// often than as a stored file.
const NAME_EXTENSIONS = new Set([
  'json', 'jsonld', 'geojson', 'ndjson', 'csv', 'tsv', 'txt', 'log', 'md', 'markdown',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml', 'html', 'pdf', 'sql', 'ipynb',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tif', 'tiff',
  'parquet', 'arrow', 'avro', 'npy', 'npz', 'h5', 'hdf5', 'nc', 'zarr',
  'zip', 'gz', 'tgz', 'tar', 'bz2', 'xz', 'zst',
  'fasta', 'fa', 'fastq', 'fq', 'bam', 'sam', 'cram', 'vcf', 'bed', 'gff', 'gtf',
  'py', 'sh', 'r', 'nf', 'cwl', 'wdl',
])

/** True when a bare word reads as a stored file name, such as `report.json`. */
export function isFileName(value: string): boolean {
  const extension = FILE_NAME.exec(value.trim())?.[1]
  return Boolean(extension && NAME_EXTENSIONS.has(extension.toLowerCase()))
}

/** The object a value names inside a bucket that is already known. */
export function keyIn(bucket: string, value: string): ObjectRef | null {
  if (objectKeyProblem(value)) return null
  return isFileName(value.slice(value.lastIndexOf('/') + 1)) ? { bucket, key: value } : null
}

// A path splits into bucket plus key only with `s3://` or a bucket the portal
// has listed; anything else is a key in this surface's bucket, or prose.
export function resolveObjectRef(value: string, bucket?: string | null): ObjectRef | null {
  const trimmed = value.trim()
  if (trimmed.startsWith(S3_PREFIX)) return parseObjectRef(trimmed)
  const split = parseObjectRef(trimmed)
  if (split && isKnownBucket(split.bucket)) return split
  const surface = bucket && !bucketNameProblem(bucket) ? bucket : ''
  return surface ? keyIn(surface, trimmed) : null
}

/** True when a written word names a bucket the portal has already listed. */
export function resolveBucketRef(value: string): string | null {
  const name = value.trim()
  return !bucketNameProblem(name) && isKnownBucket(name) ? name : null
}

/** The bucket and key a stored object path names, or null when it is prose. */
export function parseObjectRef(value: string): ObjectRef | null {
  const trimmed = value.trim()
  const s3 = trimmed.startsWith(S3_PREFIX)
  const path = s3 ? trimmed.slice(S3_PREFIX.length) : trimmed
  if (!path || path.includes('://')) return null
  const separator = path.indexOf('/')
  if (separator < 1) return null
  const bucket = path.slice(0, separator)
  const key = path.slice(separator + 1)
  if (bucketNameProblem(bucket) || objectKeyProblem(key)) return null
  if (!s3 && !FILE_SUFFIX.test(key)) return null
  return { bucket, key }
}

/** The data browser link for one bucket. */
export function bucketHref(bucket: string): string {
  return `/app/buckets/${encodeURIComponent(bucket)}`
}

/** The data browser link for one stored object, with its folder opened. */
export function objectHref(ref: ObjectRef): string {
  const separator = ref.key.lastIndexOf('/')
  const query = new URLSearchParams()
  if (separator > 0) query.set('prefix', ref.key.slice(0, separator))
  query.set('object', ref.key)
  return `${bucketHref(ref.bucket)}?${query.toString()}`
}

function textToken(state: StateCore, content: string): Token {
  const token = new state.Token('text', '', 0)
  token.content = content
  return token
}

function wrap(state: StateCore, ref: ObjectRef, inner: Token[]): Token[] {
  const open = new state.Token('link_open', 'a', 1)
  open.attrSet('href', objectHref(ref))
  open.attrSet('data-object', ref.key)
  open.attrSet('data-bucket', ref.bucket)
  return [open, ...inner, new state.Token('link_close', 'a', -1)]
}

function wrapBucket(state: StateCore, bucket: string, inner: Token[]): Token[] {
  const open = new state.Token('link_open', 'a', 1)
  open.attrSet('href', bucketHref(bucket))
  open.attrSet('data-bucket', bucket)
  return [open, ...inner, new state.Token('link_close', 'a', -1)]
}

// A bare bucket name links, but never becomes the bucket the rest of the
// message resolves against: an ordinary word that happens to be a bucket name
// would otherwise mislead every path after it.
function linked(state: StateCore, raw: string, context: Context, inner?: Token): Token[] | null {
  const body = [inner ?? textToken(state, raw)]
  const ref = resolveObjectRef(raw, context.bucket)
  if (ref) {
    context.bucket = ref.bucket
    return wrap(state, ref, body)
  }
  // A bare bucket name links only from inline code: as a plain word it reads
  // as an ordinary word just as often, such as a bucket called test.
  const bucket = inner ? resolveBucketRef(raw) : null
  return bucket ? wrapBucket(state, bucket, body) : null
}

/** The bucket a bare file name belongs to while the message is walked. */
interface Context {
  bucket: string
}

function splitText(state: StateCore, token: Token, context: Context): Token[] | null {
  const pattern = new RegExp(CANDIDATE, 'g')
  const content = token.content
  const out: Token[] = []
  let cursor = 0
  let match = pattern.exec(content)
  while (match) {
    const raw = match[0].replace(TRAILING, '')
    const tokens = linked(state, raw, context)
    if (tokens) {
      if (match.index > cursor) out.push(textToken(state, content.slice(cursor, match.index)))
      out.push(...tokens)
      cursor = match.index + raw.length
      pattern.lastIndex = cursor
    }
    match = pattern.exec(content)
  }
  if (!out.length) return null
  if (cursor < content.length) out.push(textToken(state, content.slice(cursor)))
  return out
}

function linkChildren(state: StateCore, children: Token[], context: Context): Token[] {
  const out: Token[] = []
  let depth = 0
  for (const child of children) {
    if (child.type === 'link_close') depth -= 1
    else if (depth > 0) {
      out.push(child)
      continue
    } else if (child.type === 'link_open') depth += 1
    else if (child.type === 'text') {
      const split = splitText(state, child, context)
      if (split) {
        out.push(...split)
        continue
      }
    } else if (child.type === 'code_inline') {
      const tokens = linked(state, child.content, context, child)
      if (tokens) {
        out.push(...tokens)
        continue
      }
    }
    out.push(child)
  }
  return out
}

// markdown-it plugin: links stored object paths outside code blocks. The env
// may carry `bucket`, the one the reader is browsing, so a bare file name
// links too; a bucket named in the message takes over from it.
export function objectLinks(md: MarkdownIt): void {
  md.core.ruler.push('aruna_object_links', (state) => {
    const env = state.env as { bucket?: unknown } | undefined
    const bucket = typeof env?.bucket === 'string' ? env.bucket : ''
    const context: Context = { bucket: bucketNameProblem(bucket) ? '' : bucket }
    for (const token of state.tokens) {
      if (token.type === 'inline' && token.children) token.children = linkChildren(state, token.children, context)
    }
  })
}
