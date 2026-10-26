import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type PartOfResponse } from '@/lib/api'

const aruna = vi.hoisted(() => ({ sessionEpoch: { value: 1 }, getFilePartOf: vi.fn() }))
vi.mock('@/composables/useAruna', () => ({ useAruna: () => aruna }))

const { useFilePartOf } = await import('@/composables/useFilePartOf')
type Target = import('@/composables/useFilePartOf').PartOfTarget

const target: Target = { bucket: 'lab', key: 'raw/a.fq' }
const answer = (ids: string[], more = false): PartOfResponse => ({
  datasets: ids.map((id) => ({ document_id: id, title: id, graph_iri: id, part_ids: [] })),
  more,
  complete: true,
  hidden_references_exist: false,
  more_datasets: '',
})

function start(initial: Target | null = target) {
  const asked = ref(initial)
  const scope = effectScope()
  return { asked, part: scope.run(() => useFilePartOf(asked))!, scope }
}

describe('file part of', () => {
  beforeEach(() => aruna.getFilePartOf.mockReset())

  it('asks for the datasets of a file and keeps the more flag', async () => {
    aruna.getFilePartOf.mockResolvedValue(answer(['d1'], true))
    const { part, scope } = start()
    await vi.waitFor(() => expect(part.state.value).toBe('ready'))

    expect(aruna.getFilePartOf).toHaveBeenCalledWith('lab', 'raw/a.fq')
    expect(part.found.value?.more).toBe(true)
    scope.stop()
  })

  it('reads a 404 as not available and a failure as a failure', async () => {
    aruna.getFilePartOf.mockRejectedValueOnce(new ApiError(404, 'not found'))
    const first = start()
    await vi.waitFor(() => expect(first.part.state.value).toBe('missing'))
    first.scope.stop()

    aruna.getFilePartOf.mockRejectedValueOnce(new ApiError(503, 'no metadata node answered'))
    const second = start()
    await vi.waitFor(() => expect(second.part.state.value).toBe('failed'))
    expect(second.part.error.value).toBe('no metadata node answered')
    second.scope.stop()
  })

  it('drops a late answer for the file asked before', async () => {
    let late: (value: PartOfResponse) => void = () => {}
    aruna.getFilePartOf.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)))
    aruna.getFilePartOf.mockResolvedValueOnce(answer(['d2']))
    const { asked, part, scope } = start()
    asked.value = { ...target, key: 'raw/b.fq' }
    await vi.waitFor(() => expect(part.found.value?.datasets[0]?.document_id).toBe('d2'))
    late(answer(['stale']))
    await nextTick()

    expect(part.found.value?.datasets[0]?.document_id).toBe('d2')
    scope.stop()
  })
})
