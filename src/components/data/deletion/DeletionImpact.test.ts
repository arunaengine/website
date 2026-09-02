import { describe, expect, it } from 'vitest'
import {
  button,
  click,
  content,
  element,
  mountApp,
  nodes,
  typeValue,
  type HostNode,
} from '@/test/clientRender'
import { deletionImpact, referenceTitle, referencedContent } from '@/test/deletionImpact'
import type { StorageDeletionPreflight } from '@/lib/storageDeletion'

const impact = deletionImpact()

function storagePreflight(relationships: number): StorageDeletionPreflight {
  return {
    scope: { kind: 'bucket', bucket: 'reef' },
    counts: {
      current_heads: 1,
      noncurrent_versions: 0,
      delete_markers: 0,
      open_multipart_uploads: 0,
      complete: true,
    },
    sync_relationships_apply_to_bucket_delete: true,
    sync_relationships: Array.from({ length: relationships }, (_, index) => ({
      relationship_id: `rel-${index + 1}`,
      direction: 'outgoing',
      source: `reef/one-${index + 1}`,
      target: `mirror/two-${index + 1}`,
      action: 'remove',
      blocker: false,
    })),
    permissions: { read: true, purge: true },
    truncation: { truncated: false, versions_truncated: false, multipart_uploads_truncated: false },
    reference_coverage: {
      complete: true,
      hidden_references_exist: false,
      queried_nodes: 1,
      failed_nodes: 0,
      index_freshness: 'current',
      excluded: [],
    },
  }
}

async function render(overrides: Record<string, unknown> = {}): Promise<HostNode> {
  const { root } = await mountApp(impact, {
    props: {
      preflight: storagePreflight(0),
      preflightBusy: false,
      showSyncRemoval: true,
      quotaNote: null,
      syncApplies: false,
      sourceStatus: 'loaded',
      sourceError: null,
      sourceCount: 0,
      backlinkPreflight: referencedContent(0),
      backlinkBusy: false,
      backlinkError: null,
      ...overrides,
    },
  })
  return root
}

function rows(root: HostNode, prefix: string): string[] {
  return nodes(root)
    .filter((node) => node.tag === 'li' && content(node).trim().startsWith(prefix))
    .map((node) => content(node).trim())
}

describe('deletion impact lists', () => {
  it('names the reference count without listing them', async () => {
    const root = await render({ backlinkPreflight: referencedContent(40) })

    const toggle = button(root, '40 dataset references')
    expect(toggle.props['aria-expanded']).toBe(false)
    expect(toggle.props['aria-label']).toBe('Show the 40 dataset references')
    expect(rows(root, 'Reef survey')).toHaveLength(0)
    expect(content(root)).not.toContain(referenceTitle(1))
  })

  it('expands into a filter and one page of entries', async () => {
    const root = await render({ backlinkPreflight: referencedContent(40) })

    await click(button(root, '40 dataset references'))

    expect(button(root, '40 dataset references').props['aria-expanded']).toBe(true)
    expect(element(root, (node) => node.props['aria-label'] === 'Filter dataset references')).toBeTruthy()
    const listed = rows(root, 'Reef survey')
    expect(listed).toHaveLength(25)
    expect(listed[0]).toContain(referenceTitle(1))
    expect(content(root)).toContain('15 more')
    expect(content(root)).not.toContain(referenceTitle(40))
  })

  it('reveals the next page on show more', async () => {
    const root = await render({ backlinkPreflight: referencedContent(40) })

    await click(button(root, '40 dataset references'))
    await click(button(root, 'Show more'))

    expect(rows(root, 'Reef survey')).toHaveLength(40)
    expect(content(root)).toContain(referenceTitle(40))
    expect(content(root)).not.toContain(' more')
  })

  it('filters every entry, not only the visible page', async () => {
    const root = await render({ backlinkPreflight: referencedContent(40) })

    await click(button(root, '40 dataset references'))
    const filter = element(root, (node) => node.props['aria-label'] === 'Filter dataset references')
    await typeValue(filter, 'survey 38')

    const listed = rows(root, 'Reef survey')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toContain(referenceTitle(38))
    expect(content(root)).not.toContain('more')
  })

  it('says so when a filter matches nothing', async () => {
    const root = await render({ backlinkPreflight: referencedContent(40) })

    await click(button(root, '40 dataset references'))
    await typeValue(
      element(root, (node) => node.props['aria-label'] === 'Filter dataset references'),
      'kelp',
    )

    expect(content(root)).toContain('No dataset references match this filter.')
    expect(rows(root, 'Reef survey')).toHaveLength(0)
  })

  it('counts the sync relationships a bucket delete removes', async () => {
    const root = await render({ preflight: storagePreflight(3) })

    expect(content(root)).toContain('This confirmed side effect is not a blocker.')
    expect(content(root)).not.toContain('mirror/two-1')

    await click(button(root, '3 sync relationships'))

    expect(rows(root, 'outgoing')).toHaveLength(3)
  })

  it('keeps the last-location warning out of the collapsed list', async () => {
    const preflight = referencedContent(2)
    preflight.targets[0].would_remove_last_resolvable_aruna_location = true
    preflight.targets[0].hidden_references_exist = true
    const root = await render({ backlinkPreflight: preflight })

    const text = content(root)
    expect(text).toContain("This operation would remove this content's last resolvable Aruna location.")
    expect(text).toContain('Other restricted datasets reference this content')
    expect(text).toContain('1 content')
    expect(text).not.toContain(referenceTitle(1))
  })

  it('keeps the busy and failed states of the reference lookup', async () => {
    const busy = await render({ backlinkPreflight: null, backlinkBusy: true })
    expect(content(busy)).toContain('Checking dataset references…')

    const failed = await render({ backlinkPreflight: null, backlinkError: 'the node did not answer' })
    expect(content(failed)).toContain('the node did not answer')
    expect(content(failed)).toContain('Dataset-reference lookup failed.')
  })
})
