// What the realm knows about the buckets and folders a dataset links as a whole: where a part is
// stored, its file count and size, its top entries, and the other datasets that link it. Each part
// is asked once per dataset and session; an answer for an earlier dataset or session is dropped.
import { ref, watch, type Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useAruna } from '@/composables/useAruna'
import { useRealmNodes } from '@/composables/useRealmNodes'
import { apiErrorMessage, type BucketUsageResponse, type DataLinkDocument, type PartTargetResponse } from '@/lib/api'
import { objectRoute } from '@/lib/crate/dataIdentity'
import { browseProblem, browseRoute } from '@/lib/linkedPart'

export interface PartEntry {
  name: string
  folder: boolean
  size: number | null
  route: RouteLocationRaw
}

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
  others: DataLinkDocument[]
}

const SHOWN = 10
// The last facts of each part per dataset, kept for the session, so a new visit shows them at once
// while they are read again.
const remembered = new Map<string, LinkedPartFacts>()
let rememberedEpoch = -1

export function useLinkedParts(ids: Ref<string[]>, datasetId: Ref<string>, wantsEntries: (id: string) => boolean) {
  const { getPartTarget, getBucketUsage, getBucketDistribution, listBucketObjects, getDataLinks, searchBuckets, sessionEpoch } = useAruna()
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

  async function load(id: string, round: number) {
    const current = () => round === generation
    let target: PartTargetResponse
    try {
      target = await memberOf(await getPartTarget(id))
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
    const [usage, page, links, distribution] = await Promise.all([
      bucket && !target.prefix ? getBucketUsage(bucket, node).catch(() => null) : null,
      bucket && !problem && wantsEntries(id)
        ? listBucketObjects(bucket, { prefix: target.prefix || undefined, delimiter: '/', limit: SHOWN + 1 }, node).catch(() => null)
        : null,
      getDataLinks(id, { parts_only: true }).catch(() => null),
      bucket && target.set_id ? getBucketDistribution(bucket, undefined, node).catch(() => null) : null,
    ])
    if (!current()) return
    const nodeQuery = node ? { node } : {}
    const list: PartEntry[] = page
      ? [
          ...page.prefixes.map((prefix) => ({
            name: prefix.slice(target.prefix.length).replace(/\/$/, ''),
            folder: true,
            size: null,
            route: browseRoute({ ...target, prefix }, isLocalNode),
          })),
          ...page.objects.map((object) => {
            const route = objectRoute(bucket, object.key)
            return { name: object.key.slice(target.prefix.length), folder: false, size: object.size ?? null, route: { ...route, query: { ...route.query, ...nodeQuery } } }
          }),
        ]
      : []
    put(id, {
      ...base,
      nodes: distribution ? [...new Set(distribution.members.map((member) => member.node_id))] : nodes,
      usage,
      entries: page ? { list: list.slice(0, SHOWN), more: list.length > SHOWN || Boolean(page.next_cursor) } : null,
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
