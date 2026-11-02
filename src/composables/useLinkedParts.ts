// What the realm knows about the buckets and folders a dataset links as a whole: where a part is
// stored, its file count and size, its top entries, and the other datasets that link it. Each part
// is asked once per dataset and session; an answer for an earlier dataset or session is dropped.
import { ref, watch, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage, type BucketUsageResponse, type DataLinkDocument, type ObjectListResponse, type PartTargetResponse } from '@/lib/api'
import { objectRoute } from '@/lib/crate/dataIdentity'
import { browseProblem, browseRoute } from '@/lib/linkedPart'
import { parseArunaArn } from '@/lib/sync'
import { drsDownloadHref } from '@/lib/tes'
import { isHttpUrl } from '@/lib/utils'

export interface PartEntry {
  name: string
  folder: boolean
  size: number | null
  route: RouteLocationRaw
  /** Signed out, the download of a file from the node that holds it. */
  download?: string
  /** A folder's full prefix, so a visitor can open it in place. */
  prefix?: string
}

/** Signed out, where the files below a part download: DRS on the bucket's node, S3 on a set member. */
export type PartDownload = { drs: string; arn: string } | { s3: string }

export interface LinkedPartFacts {
  target: PartTargetResponse | null
  /** Why the files cannot be opened from here, or null. */
  problem: string | null
  route: RouteLocationRaw | null
  /** The nodes that store the bucket: its one node, or every member of a bucket on more nodes. */
  nodes: string[]
  /** The bucket's own count; only for a part that is a whole bucket. */
  usage: BucketUsageResponse | null
  /** The first entries below the part, when asked for; `more` when the bucket holds further ones. */
  entries: { list: PartEntry[]; more: boolean } | null
  /** Why the entries below the part could not be listed, or null. */
  listError?: string | null
  others: DataLinkDocument[]
  /** Signed out, how a visitor downloads the files below the part. */
  download?: PartDownload | null
}

const SHOWN = 10

function downloadHref(where: PartDownload | null | undefined, bucket: string, key: string, version: string) {
  if (!where) return {}
  const href = 's3' in where
    ? `${where.s3}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
    : drsDownloadHref(where.drs, `${where.arn}${key}@${version}`)
  // A node publishes its own addresses; only HTTP(S) becomes a link.
  return isHttpUrl(href) ? { download: href } : {}
}

// One listed level below `prefix`: its folders open in Data, or in place for a visitor.
function entryList(
  target: PartTargetResponse,
  prefix: string,
  page: ObjectListResponse,
  isLocalNode: (nodeId: string) => boolean,
  where?: PartDownload | null,
): PartEntry[] {
  const bucket = target.bucket ?? ''
  const node = target.node_id && !isLocalNode(target.node_id) ? { node: target.node_id } : {}
  return [
    ...page.prefixes.map((folder) => ({
      name: folder.slice(prefix.length).replace(/\/$/, ''),
      folder: true,
      size: null,
      route: browseRoute({ ...target, prefix: folder }, isLocalNode),
      prefix: folder,
    })),
    // The folder's own empty marker object is no file of it.
    ...page.objects.filter((object) => object.key !== prefix).map((object) => {
      const route = objectRoute(bucket, object.key)
      return {
        name: object.key.slice(prefix.length),
        folder: false,
        size: object.size ?? null,
        route: { ...route, query: { ...route.query, ...node } },
        ...downloadHref(where, bucket, object.key, object.version_id),
      }
    }),
  ]
}
// The last facts of each part per dataset, kept for the session, so a new visit shows them at once
// while they are read again.
const remembered = new Map<string, LinkedPartFacts>()
let rememberedEpoch = -1

export function useLinkedParts(ids: Ref<string[]>, datasetId: Ref<string>, wantsEntries: (id: string) => boolean) {
  const { getPartTarget, getBucketUsage, getBucketDistribution, listBucketObjects, getDataLinks, searchBuckets, sessionEpoch, authToken, nodeClientReady, getNodeInfo, nodeInfo } = useAruna()
  const { isLocalNode } = useRealmNodes()
  const facts = ref(new Map<string, LinkedPartFacts>())
  let generation = 0
  const asked = new Set<string>()

  const memoryKey = (id: string) => `${datasetId.value}\n${id}`
  const put = (id: string, value: LinkedPartFacts) => {
    remembered.set(memoryKey(id), value)
    facts.value = new Map(facts.value).set(id, value)
  }

  // A node outside a distributed bucket knows only its set; the bucket search names its members.
  async function memberOf(target: PartTargetResponse): Promise<PartTargetResponse> {
    if (target.held_here || target.node_id || !target.set_id || !target.bucket) return target
    const found = await searchBuckets(target.bucket, { limit: 50 }).catch(() => null)
    const member = found?.hits.find((hit) => hit.set_id === target.set_id && !isLocalNode(hit.node_id))
    return member ? { ...target, node_id: member.node_id } : target
  }

  // A node bucket downloads by DRS on its node; a set's files by plain S3 on the member listed.
  async function visitorDownload(target: PartTargetResponse, arn: ReturnType<typeof parseArunaArn>): Promise<PartDownload | null> {
    if (!target.bucket) return null
    if (arn) {
      const api = (await nodeClientReady(arn.nodeId).catch(() => null))?.baseUrl
      return api ? { drs: api, arn: `arn:aruna:${arn.realmId}:${arn.nodeId}:s3/${target.bucket}/` } : null
    }
    const info = target.node_id ? await getNodeInfo(target.node_id).catch(() => null) : nodeInfo.value
    const s3 = info?.services?.interfaces?.s3?.url
    return s3 ? { s3: s3.replace(/\/+$/, '') } : null
  }

  async function load(id: string, round: number) {
    const current = () => round === generation
    // Signed out, the nodes refuse the part lookup, but a node ARN names its node and bucket itself.
    const parsed = authToken.value ? null : parseArunaArn(id)
    const arn = parsed?.resourceType === 's3' ? parsed : null
    let target: PartTargetResponse
    try {
      target = arn
        ? { id, bucket: arn.bucket, prefix: arn.prefix, set_id: null, node_id: arn.nodeId, held_here: isLocalNode(arn.nodeId) }
        : await memberOf(await getPartTarget(id))
    } catch (cause) {
      if (current()) put(id, { target: null, problem: apiErrorMessage(cause), route: null, nodes: [], usage: null, entries: null, others: [] })
      return
    }
    if (!current()) return
    const problem = browseProblem(target, isLocalNode)
    const nodes = target.node_id ? [target.node_id] : []
    const base = { target, problem, route: problem ? null : browseRoute(target, isLocalNode), nodes, usage: null, entries: null, others: [] }
    if (!facts.value.has(id)) put(id, base)
    const node = target.node_id && !isLocalNode(target.node_id) ? target.node_id : null
    const bucket = target.bucket ?? ''
    let listError: string | null = null
    const [usage, page, links, distribution] = await Promise.all([
      bucket && !target.prefix ? getBucketUsage(bucket, node).catch(() => null) : null,
      bucket && !problem && wantsEntries(id)
        ? listBucketObjects(bucket, { prefix: target.prefix || undefined, delimiter: '/', limit: SHOWN + 1 }, node).catch((cause: unknown) => {
          listError = apiErrorMessage(cause)
          return null
        })
        : null,
      getDataLinks(id, { parts_only: true }).catch(() => null),
      bucket && target.set_id ? getBucketDistribution(bucket, undefined, node).catch(() => null) : null,
    ])
    const download = authToken.value || problem ? null : await visitorDownload(target, arn)
    if (!current()) return
    const list = page ? entryList(target, target.prefix, page, isLocalNode, download) : []
    put(id, {
      ...base,
      download,
      nodes: distribution ? [...new Set(distribution.members.map((member) => member.node_id))] : nodes,
      usage,
      entries: page ? { list: list.slice(0, SHOWN), more: list.length > SHOWN || Boolean(page.next_cursor) } : null,
      listError,
      others: (links?.documents ?? []).filter((document) => document.document_id !== datasetId.value),
    })
  }

  watch(
    [datasetId, sessionEpoch],
    () => {
      generation++
      asked.clear()
      facts.value = new Map()
      if (rememberedEpoch !== sessionEpoch.value) remembered.clear()
      rememberedEpoch = sessionEpoch.value
    },
    { immediate: true },
  )
  watch(
    [ids, datasetId, sessionEpoch],
    () => {
      for (const id of ids.value) {
        if (asked.has(id)) continue
        asked.add(id)
        const known = remembered.get(memoryKey(id))
        if (known) facts.value = new Map(facts.value).set(id, known)
        void load(id, generation)
      }
    },
    { immediate: true },
  )

  return facts
}

const MORE = 50

/**
 * Signed out, the folders below linked parts that a visitor opened in place, keyed by part and
 * prefix. "Show more" lists the folder again with more entries. Answers of an earlier dataset drop.
 */
export function usePartFolders(datasetId: Ref<string>) {
  const { listBucketObjects, sessionEpoch } = useAruna()
  const { isLocalNode } = useRealmNodes()
  const folders = ref(new Map<string, { list: PartEntry[]; more: boolean; loading: boolean; error?: string | null }>())
  let generation = 0
  watch([datasetId, sessionEpoch], () => {
    generation++
    folders.value = new Map()
  })

  const keyOf = (part: LinkedPartFacts, prefix: string) => `${part.target?.id ?? ''}\n${prefix}`

  async function list(part: LinkedPartFacts, prefix: string, limit: number) {
    const target = part.target
    if (!target?.bucket) return
    const key = keyOf(part, prefix)
    const round = generation
    const known = folders.value.get(key)
    folders.value = new Map(folders.value).set(key, { list: known?.list ?? [], more: false, loading: true })
    const node = target.node_id && !isLocalNode(target.node_id) ? target.node_id : null
    let error: string | null = null
    const page = await listBucketObjects(target.bucket, { prefix: prefix || undefined, delimiter: '/', limit: limit + 1 }, node).catch((cause: unknown) => {
      error = apiErrorMessage(cause)
      return null
    })
    if (round !== generation || !folders.value.has(key)) return
    const entries = page ? entryList(target, prefix, page, isLocalNode, part.download) : (known?.list ?? [])
    folders.value = new Map(folders.value).set(key, {
      list: entries.slice(0, page ? limit : undefined),
      more: page ? entries.length > limit || Boolean(page.next_cursor) : false,
      loading: false,
      error,
    })
  }

  function toggle(part: LinkedPartFacts, prefix: string) {
    const key = keyOf(part, prefix)
    if (!folders.value.has(key)) return void list(part, prefix, MORE)
    const next = new Map(folders.value)
    next.delete(key)
    folders.value = next
  }

  function more(part: LinkedPartFacts, prefix: string, shown: number) {
    void list(part, prefix, shown + MORE)
  }

  return { folders, keyOf, toggle, more }
}
