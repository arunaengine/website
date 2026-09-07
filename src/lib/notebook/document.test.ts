import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOSAVE_INTERVAL_MS,
  autosaveDue,
  clearResumePoint,
  clearWorkingCopy,
  dependencyKey,
  isNotebookKey,
  notebookKey,
  notebookName,
  notebookSlug,
  readResumePoint,
  readWorkingCopy,
  workingCopyKey,
  writeResumePoint,
  writeWorkingCopy,
} from './document'
import { sessionSubmitRequest, sessionProblems } from './submit'
import { memoryStorage } from '@/test/storage'


afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notebook keys', () => {
  it('names the file and its dependency list beside it', () => {
    expect(notebookKey('counts')).toBe('notebooks/counts.ipynb')
    expect(notebookKey('counts', 'runs/june/')).toBe('runs/june/counts.ipynb')
    expect(notebookKey('counts', '')).toBe('counts.ipynb')
    expect(dependencyKey('notebooks/counts.ipynb', 'requirements')).toBe('notebooks/counts.requirements.txt')
    expect(dependencyKey('runs/june/counts.ipynb', 'requirements')).toBe('runs/june/counts.requirements.txt')
    expect(dependencyKey('counts.ipynb', 'deno')).toBe('counts.deno.json')
  })

  it('reads the name back out of a key', () => {
    expect(notebookName('notebooks/counts.ipynb')).toBe('counts')
    expect(notebookName('other/place/run.ipynb')).toBe('run')
  })

  it('recognises a notebook object', () => {
    expect(isNotebookKey('a/b.ipynb')).toBe(true)
    expect(isNotebookKey('a/b.IPYNB')).toBe(true)
    expect(isNotebookKey('a/b.txt')).toBe(false)
  })

  it('turns a title into a key segment', () => {
    expect(notebookSlug('First Look!')).toBe('first-look')
    expect(notebookSlug('   ')).toBe('notebook')
  })
})

describe('working copy', () => {
  it('keeps the text under a key of bucket and object', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    writeWorkingCopy('scope-a', 'lab-data', 'notebooks/counts.ipynb', '{"cells":[]}', 100)
    expect(workingCopyKey('scope-a', 'lab-data', 'notebooks/counts.ipynb')).toBe(
      'aruna.notebook.["scope-a","lab-data","notebooks/counts.ipynb"]',
    )
    expect(readWorkingCopy('scope-a', 'lab-data', 'notebooks/counts.ipynb')).toEqual({
      text: '{"cells":[]}',
      changed_at_ms: 100,
    })
    clearWorkingCopy('scope-a', 'lab-data', 'notebooks/counts.ipynb')
    expect(readWorkingCopy('scope-a', 'lab-data', 'notebooks/counts.ipynb')).toBeNull()
  })

  it('survives a store that refuses to write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    })
    expect(() => writeWorkingCopy('scope-a', 'b', 'k', 'x', 1)).not.toThrow()
    expect(readWorkingCopy('scope-a', 'b', 'k')).toBeNull()
  })
})

describe('resume point', () => {
  it('keeps the last event id per session job', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(readResumePoint('scope-a', '01JOB')).toBe(0)
    writeResumePoint('scope-a', '01JOB', 42)
    writeResumePoint('scope-a', '01OTHER', 7)
    expect(readResumePoint('scope-a', '01JOB')).toBe(42)
    expect(readResumePoint('scope-a', '01OTHER')).toBe(7)
    clearResumePoint('scope-a', '01JOB')
    expect(readResumePoint('scope-a', '01JOB')).toBe(0)
    expect(readResumePoint('scope-a', '01OTHER')).toBe(7)
  })

  it('answers zero for anything that is not a positive id', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    localStorage.setItem('aruna.notebook.resume.["scope-a","01JOB"]', 'later')
    expect(readResumePoint('scope-a', '01JOB')).toBe(0)
    writeResumePoint('scope-a', '01JOB', 0)
    expect(readResumePoint('scope-a', '01JOB')).toBe(0)
  })

  it('survives a store that refuses to work', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => writeResumePoint('scope-a', '01JOB', 3)).not.toThrow()
    expect(() => clearResumePoint('scope-a', '01JOB')).not.toThrow()
    expect(readResumePoint('scope-a', '01JOB')).toBe(0)
  })
})

describe('autosaveDue', () => {
  it('waits the full interval after the last save', () => {
    expect(autosaveDue(10, 0, AUTOSAVE_INTERVAL_MS - 1)).toBe(false)
    expect(autosaveDue(10, 0, AUTOSAVE_INTERVAL_MS)).toBe(true)
  })

  it('stays quiet while nothing changed', () => {
    expect(autosaveDue(null, 0, AUTOSAVE_INTERVAL_MS * 10)).toBe(false)
  })
})

describe('sessionSubmitRequest', () => {
  const draft = {
    groupId: 'group-1',
    name: 'counts',
    runtime: 'python-notebook',
    workspaceBucket: 'lab-data',
    idempotencyKey: 'session-1',
  }

  it('names the runtime and leaves image and command empty', () => {
    const request = sessionSubmitRequest(draft)
    expect(request.runtime).toBe('python-notebook')
    expect(request.image).toBe('')
    expect(request.command).toEqual([])
    expect(request.tags['aruna-engine.org/session']).toBe('notebook')
    expect(request.workspace).toEqual({ mode: 'existing', bucket: 'lab-data' })
    expect(request.inputs).toEqual([])
  })

  it('stages the dependency list and opens the network', () => {
    const request = sessionSubmitRequest({
      ...draft,
      dependencyKey: 'notebooks/counts.requirements.txt',
      dependencyKind: 'requirements',
    })
    expect(request.inputs).toEqual([
      { bucket: 'lab-data', key: 'notebooks/counts.requirements.txt', dest_key: 'requirements.txt' },
    ])
    expect(request.tags['aruna-engine.org/network']).toBe('open')
  })

  it('stages a shared Conda environment file', () => {
    const request = sessionSubmitRequest({ ...draft, dependencyKey: 'notebooks/counts.environment.yml', dependencyKind: 'conda' })
    expect(request.inputs).toEqual([{ bucket: 'lab-data', key: 'notebooks/counts.environment.yml', dest_key: 'environment.yml' }])
    expect(request.tags['aruna-engine.org/network']).toBe('open')
  })

  it('carries resources, placement and a shorter idle timeout', () => {
    const request = sessionSubmitRequest({
      ...draft,
      resources: { cpu_cores: 2, ram_bytes: 4_000_000_000 },
      placement: { node: 'node-a', executor_kind: 'docker', labels: { region: 'eu' } },
      idleAfterMs: 600_000,
    })
    expect(request.cpu_cores).toBe(2)
    expect(request.ram_bytes).toBe(4_000_000_000)
    expect(request.executor_constraint).toBe('docker')
    expect(request.tags['aruna-engine.org/label/aruna-engine.org/node']).toBe('node-a')
    expect(request.tags['aruna-engine.org/label/region']).toBe('eu')
    expect(request.session_idle_after_ms).toBe(600_000)
  })

  it('reports what a session still needs', () => {
    expect(sessionProblems({ ...draft, workspaceBucket: '' })).toEqual([
      'Pick the bucket the notebook works in.',
    ])
    expect(sessionProblems(draft)).toEqual([])
  })

  it('keeps one idempotency key for the whole request', () => {
    expect(sessionSubmitRequest(draft).idempotency_key).toBe('session-1')
  })
})
