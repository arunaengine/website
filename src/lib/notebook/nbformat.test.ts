import { describe, expect, it } from 'vitest'
import {
  emptyNotebook,
  isPipelineCell,
  newCell,
  outputText,
  parseNotebook,
  serializeNotebook,
  type NotebookAruna,
} from './nbformat'
import { renderOutput } from './outputs'

const aruna: NotebookAruna = {
  version: 1,
  runtime: 'python-notebook',
  workspace_bucket: 'lab-data',
  group_id: 'group-1',
}

describe('parseNotebook', () => {
  it('reads a source written as a list of lines', () => {
    const notebook = parseNotebook(
      JSON.stringify({
        cells: [{ cell_type: 'code', id: 'c1', source: ['print(1)\n', 'print(2)\n'], metadata: {} }],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 5,
      }),
    )
    expect(notebook.cells[0].source).toBe('print(1)\nprint(2)\n')
  })

  it('keeps unknown metadata and reads the aruna block', () => {
    const notebook = parseNotebook(
      JSON.stringify({
        cells: [],
        metadata: { kernelspec: { name: 'python3' }, aruna },
        nbformat: 4,
        nbformat_minor: 5,
      }),
    )
    expect(notebook.metadata.kernelspec).toEqual({ name: 'python3' })
    expect(notebook.metadata.aruna.workspace_bucket).toBe('lab-data')
  })

  it('answers one empty code cell for a notebook without cells', () => {
    const notebook = parseNotebook(JSON.stringify({ cells: [], metadata: {}, nbformat: 4 }))
    expect(notebook.cells).toHaveLength(1)
    expect(notebook.cells[0].cell_type).toBe('code')
  })

  it('drops a cell of an unknown kind', () => {
    const notebook = parseNotebook(
      JSON.stringify({
        cells: [{ cell_type: 'heading', source: 'x' }, { cell_type: 'markdown', source: 'y' }],
        metadata: {},
      }),
    )
    expect(notebook.cells).toHaveLength(1)
    expect(notebook.cells[0].cell_type).toBe('markdown')
  })

  it('refuses text that is not a notebook', () => {
    expect(() => parseNotebook('[]')).not.toThrow()
    expect(() => parseNotebook('not json')).toThrow()
  })
})

describe('serializeNotebook', () => {
  it('writes a document that reads back the same', () => {
    const notebook = emptyNotebook(aruna)
    notebook.cells[0].source = 'print("hi")'
    notebook.cells[0].outputs = [{ output_type: 'stream', name: 'stdout', text: 'hi\n' }]
    notebook.cells[0].execution_count = 1
    const again = parseNotebook(serializeNotebook(notebook))
    expect(again.cells[0].source).toBe('print("hi")')
    expect(again.cells[0].outputs).toHaveLength(1)
    expect(again.cells[0].execution_count).toBe(1)
    expect(again.metadata.aruna.runtime).toBe('python-notebook')
  })

  it('leaves outputs off a markdown cell', () => {
    const notebook = emptyNotebook(aruna)
    notebook.cells = [newCell('markdown', '# Title')]
    const written = JSON.parse(serializeNotebook(notebook)) as { cells: Record<string, unknown>[] }
    expect(written.cells[0].outputs).toBeUndefined()
    expect(written.cells[0].execution_count).toBeUndefined()
  })
})

describe('cells', () => {
  it('recognises a pipeline cell by its metadata', () => {
    const cell = newCell('raw', '{}')
    expect(isPipelineCell(cell)).toBe(false)
    cell.metadata.aruna = { kind: 'pipeline' }
    expect(isPipelineCell(cell)).toBe(true)
  })

  it('gives every new cell an id a session accepts', () => {
    expect(newCell('code').id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  })
})

describe('outputText', () => {
  it('reads stream text and the plain representation', () => {
    expect(outputText({ output_type: 'stream', name: 'stdout', text: 'a\n' })).toBe('a\n')
    expect(
      outputText({ output_type: 'display_data', data: { 'text/plain': ['x', 'y'] } }),
    ).toBe('xy')
  })
})

describe('renderOutput', () => {
  it('prefers html over plain text', () => {
    const render = renderOutput({
      output_type: 'display_data',
      data: { 'text/html': '<b>x</b>', 'text/plain': 'x' },
    })
    expect(render).toEqual({ kind: 'html', text: '<b>x</b>' })
  })

  it('builds a data url for a png', () => {
    const render = renderOutput({
      output_type: 'display_data',
      data: { 'image/png': 'AAAB\n', 'text/plain': '<Figure>' },
    })
    expect(render).toEqual({ kind: 'image', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAB' })
  })

  it('shows json as text', () => {
    const render = renderOutput({
      output_type: 'execute_result',
      execution_count: 2,
      data: { 'application/json': { a: 1 } },
    })
    expect(render).toEqual({ kind: 'json', text: '{\n  "a": 1\n}' })
  })

  it('keeps an error with its traceback', () => {
    const render = renderOutput({
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad',
      traceback: ['line 1'],
    })
    expect(render).toEqual({ kind: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['line 1'] })
  })
})
