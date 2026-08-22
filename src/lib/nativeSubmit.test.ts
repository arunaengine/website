import { describe, expect, it } from 'vitest'
import {
  defaultPlacement,
  droppedNativeFields,
  isNativeBlocked,
  nativeSubmitRequired,
  tesFormToExecutionRequest,
  type NativePlacementOptions,
  type NativeSubmitForm,
} from './nativeSubmit'
import { captureOutput, type TesTask } from './tes'

function task(overrides: Partial<TesTask> = {}): TesTask {
  return {
    executors: [{ image: 'tools:1', command: ['run', '--in', '/inputs/reads.fastq'], env: { T: '2' } }],
    inputs: [{ url: 's3://project/raw/reads.fastq', path: '/inputs/reads.fastq', type: 'FILE' }],
    outputs: [{ url: 's3://results/reports/out.html', path: '/outputs/out.html' }],
    resources: { cpu_cores: 2, ram_gb: 4 },
    ...overrides,
  }
}

function form(overrides: Partial<NativeSubmitForm> = {}): NativeSubmitForm {
  return {
    groupId: '01GROUP',
    task: task(),
    placement: defaultPlacement(),
    ...overrides,
  }
}

function placement(overrides: Partial<NativePlacementOptions> = {}): NativePlacementOptions {
  return { ...defaultPlacement(), ...overrides }
}

function mapped(input: NativeSubmitForm) {
  const result = tesFormToExecutionRequest(input)
  if (isNativeBlocked(result)) throw new Error(`unexpectedly blocked: ${result.blocked}`)
  return result.request
}

describe('native submission decision', () => {
  it('stays on TES while every option is at its default', () => {
    expect(nativeSubmitRequired(defaultPlacement())).toBe(false)
    // `kept` is the backend's own default for an omitted workspace block.
    expect(nativeSubmitRequired(placement({ workspace: { mode: 'kept' } }))).toBe(false)
    expect(nativeSubmitRequired(placement({ outputPrefixes: ['  '] }))).toBe(false)
  })

  it('switches for every option TES cannot carry', () => {
    const cases: NativePlacementOptions[] = [
      placement({ inputs: { '/in/a': { mode: 'floating_reference' } } }),
      placement({ inputs: { '/in/a': { mode: 'exact_reference', versionId: 'v1' } } }),
      placement({ inputs: { '/in/a': { mode: 'snapshot', versionId: 'v1' } } }),
      placement({ collisionPolicy: 'replace' }),
      placement({ collisionPolicy: 'keep_existing' }),
      placement({ outputPrefixes: ['reports/'] }),
      placement({ workspace: { mode: 'temporary' } }),
      placement({ workspace: { mode: 'existing', bucket: 'scratch' } }),
    ]
    for (const option of cases) expect(nativeSubmitRequired(option)).toBe(true)
  })
})

describe('task to execution request', () => {
  it('maps a straightforward draft', () => {
    const request = mapped(form({ executorConstraint: 'docker', idempotencyKey: 'key-1' }))

    expect(request).toEqual({
      group_id: '01GROUP',
      image: 'tools:1',
      command: ['run', '--in', '/inputs/reads.fastq'],
      env: { T: '2' },
      inputs: [
        {
          bucket: 'project',
          key: 'raw/reads.fastq',
          dest_key: 'reads.fastq',
          container_path: '/inputs/reads.fastq',
          mode: 'snapshot',
        },
      ],
      outputs: [{ container_path: '/outputs/out.html', dest_key: 'reports/out.html' }],
      output_prefixes: [],
      collision_policy: 'reject',
      cpu_cores: 2,
      ram_bytes: 4_000_000_000,
      executor_constraint: 'docker',
      idempotency_key: 'key-1',
    })
  })

  it('omits a kept workspace and sends the other two', () => {
    expect(mapped(form({ placement: placement({ workspace: { mode: 'kept' } }) })).workspace)
      .toBeUndefined()
    expect(mapped(form({ placement: placement({ workspace: { mode: 'temporary' } }) })).workspace)
      .toEqual({ mode: 'temporary' })
    expect(
      mapped(form({ placement: placement({ workspace: { mode: 'existing', bucket: ' scratch ' } }) }))
        .workspace,
    ).toEqual({ mode: 'existing', bucket: 'scratch' })
  })

  it('carries a pinned version only on an exact reference', () => {
    const pinned = mapped(
      form({
        placement: placement({
          inputs: { '/inputs/reads.fastq': { mode: 'exact_reference', versionId: '01VERSION' } },
        }),
      }),
    )
    const floating = mapped(
      form({
        placement: placement({ inputs: { '/inputs/reads.fastq': { mode: 'floating_reference' } } }),
      }),
    )

    expect(pinned.inputs[0]).toMatchObject({ mode: 'exact_reference', version_id: '01VERSION' })
    expect(floating.inputs[0].version_id).toBeUndefined()
    expect(floating.inputs[0].mode).toBe('floating_reference')
  })

  it('refuses an exact pin with no version and a floating one with a version', () => {
    const missing = tesFormToExecutionRequest(
      form({ placement: placement({ inputs: { '/inputs/reads.fastq': { mode: 'exact_reference' } } }) }),
    )
    const surplus = tesFormToExecutionRequest(
      form({
        placement: placement({
          inputs: { '/inputs/reads.fastq': { mode: 'floating_reference', versionId: 'v1' } },
        }),
      }),
    )

    expect(missing).toEqual({ blocked: expect.stringContaining('names none'), kind: 'invalid' })
    expect(surplus).toEqual({ blocked: expect.stringContaining('cannot also name one'), kind: 'invalid' })
  })

  it('reports each draft it cannot express natively', () => {
    const cases: Array<[NativeSubmitForm, string]> = [
      [
        form({ task: task({ executors: [
          { image: 'a', command: ['x'] },
          { image: 'b', command: ['y'] },
        ] }) }),
        'exactly one executor',
      ],
      [form({ task: task({ executors: [] }) }), 'no executor'],
      [form({ task: task({ volumes: ['/scratch'] }) }), 'Declared volumes'],
      [
        form({ task: task({ inputs: [{ content: 'inline', path: '/inputs/a.txt' }] }) }),
        'inline content',
      ],
      [
        form({ task: task({ inputs: [{ url: 'https://example.test/a', path: '/inputs/a' }] }) }),
        'not an s3://bucket/key reference',
      ],
      [
        form({ task: task({ inputs: [{ url: 's3://b/k', path: '/inputs/a', type: 'DIRECTORY' }] }) }),
        'directory input',
      ],
      [
        form({ task: task({ outputs: [{ url: 's3://r/out/', path: '/outputs/dir/' }] }) }),
        'folder capture',
      ],
      [
        form({ task: task({ outputs: [captureOutput('/out/reports/', 'r', 'reports/')] }) }),
        'folder capture /out/reports/',
      ],
      [
        form({ task: task({ outputs: [{ url: 'file:///tmp/out', path: '/outputs/out' }] }) }),
        'not an s3://bucket/key destination',
      ],
    ]
    for (const [input, reason] of cases) {
      const result = tesFormToExecutionRequest(input)
      expect(isNativeBlocked(result)).toBe(true)
      expect(result).toEqual({ blocked: expect.stringContaining(reason), kind: 'unsupported' })
    }
  })

  it('needs a group before it maps anything', () => {
    expect(tesFormToExecutionRequest(form({ groupId: '  ' }))).toEqual({
      blocked: expect.stringContaining('owning group'),
      kind: 'invalid',
    })
  })

  it('converts ram as decimal GB like the backend does', () => {
    expect(mapped(form({ task: task({ resources: { ram_gb: 1.5 } }) })).ram_bytes).toBe(1_500_000_000)
    expect(mapped(form({ task: task({ resources: { ram_gb: 0 } }) })).ram_bytes).toBeUndefined()
    expect(mapped(form({ task: task({ resources: {} }) })).ram_bytes).toBeUndefined()
    expect(mapped(form({ task: task({ resources: { cpu_cores: 0 } }) })).cpu_cores).toBeUndefined()
  })

  it('names the fields the native surface has nowhere to put', () => {
    expect(droppedNativeFields(task({ resources: { disk_gb: 20, preemptible: true } }))).toEqual([
      'disk request',
      'preemptible flag',
    ])
    expect(droppedNativeFields(task())).toEqual([])
  })
})
