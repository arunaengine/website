import { describe, expect, it, vi } from 'vitest'
import { APICallError, dynamicTool, jsonSchema, type ToolSet } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { providerErrorMessage, runTurn } from './chat'
import { DENIAL_MESSAGE } from './types'

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: '1' },
        { type: 'text-delta' as const, id: '1', delta: text },
        { type: 'text-end' as const, id: '1' },
        { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: USAGE },
      ],
    }),
  }
}

function toolCallStream(toolName: string, input: Record<string, unknown>) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        {
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName,
          input: JSON.stringify(input),
        },
        { type: 'finish' as const, finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage: USAGE },
      ],
    }),
  }
}

function handlers() {
  return {
    text: [] as string[],
    calls: [] as Array<{ id: string; name: string; input: unknown }>,
    results: [] as Array<{ id: string; output: unknown }>,
    errors: [] as Array<{ id: string; message: string }>,
    sources: [] as Array<{ url: string; title?: string }>,
  }
}

function options(model: MockLanguageModelV4, tools: ToolSet, sink: ReturnType<typeof handlers>) {
  return {
    model,
    system: 'be brief',
    messages: [{ role: 'user' as const, content: 'hello' }],
    tools,
    onText: (delta: string) => sink.text.push(delta),
    onToolCall: (call: { id: string; name: string; input: unknown }) => sink.calls.push(call),
    onToolResult: (result: { id: string; output: unknown }) => sink.results.push(result),
    onToolError: (failure: { id: string; message: string }) => sink.errors.push(failure),
    onSource: (source: { url: string; title?: string }) => sink.sources.push(source),
  }
}

describe('runTurn', () => {
  it('streams text deltas and returns the response messages', async () => {
    const sink = handlers()
    const model = new MockLanguageModelV4({ doStream: textStream('hi there') })

    const result = await runTurn(options(model, {}, sink))

    expect(sink.text).toEqual(['hi there'])
    expect(result.error).toBeUndefined()
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('hands the web pages a search drew on to the caller', async () => {
    const sink = handlers()
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            { type: 'source' as const, sourceType: 'url' as const, id: 's-1', url: 'https://example.test/a', title: 'Example page' },
            { type: 'source' as const, sourceType: 'url' as const, id: 's-2', url: 'https://example.test/b' },
            { type: 'text-start' as const, id: '1' },
            { type: 'text-delta' as const, id: '1', delta: 'See the page.' },
            { type: 'text-end' as const, id: '1' },
            { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: USAGE },
          ],
        }),
      },
    })

    await runTurn(options(model, {}, sink))

    expect(sink.sources).toEqual([
      { url: 'https://example.test/a', title: 'Example page' },
      { url: 'https://example.test/b' },
    ])
  })

  it('keeps a blank line between text the model writes in separate blocks', async () => {
    const sink = handlers()
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            { type: 'text-start' as const, id: '1' },
            { type: 'text-delta' as const, id: '1', delta: 'Added the rule.' },
            { type: 'text-end' as const, id: '1' },
            { type: 'text-start' as const, id: '2' },
            { type: 'text-delta' as const, id: '2', delta: 'Next, the licence.' },
            { type: 'text-end' as const, id: '2' },
            { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: USAGE },
          ],
        }),
      },
    })

    await runTurn(options(model, {}, sink))

    expect(sink.text.join('')).toBe('Added the rule.\n\nNext, the licence.')
  })

  it('runs a tool call and feeds its result back for a second step', async () => {
    const sink = handlers()
    const execute = vi.fn(async () => ({ buckets: ['a'] }))
    const tools: ToolSet = {
      list_buckets: dynamicTool({
        description: 'lists',
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute,
      }),
    }
    const model = new MockLanguageModelV4({
      doStream: [toolCallStream('list_buckets', {}), textStream('one bucket')],
    })

    const result = await runTurn(options(model, tools, sink))

    expect(execute).toHaveBeenCalledOnce()
    expect(sink.calls).toEqual([{ id: 'call-1', name: 'list_buckets', input: {} }])
    expect(sink.results).toEqual([{ id: 'call-1', output: { buckets: ['a'] } }])
    expect(sink.text).toEqual(['one bucket'])
    expect(result.error).toBeUndefined()
  })

  it('reports a denial as a plain tool result the model can read', async () => {
    // A denied write must not look like a transport failure to the model.
    const sink = handlers()
    const tools: ToolSet = {
      write_object: dynamicTool({
        description: 'writes',
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => ({ error: DENIAL_MESSAGE }),
      }),
    }
    const model = new MockLanguageModelV4({
      doStream: [toolCallStream('write_object', { key: 'k' }), textStream('understood')],
    })

    await runTurn(options(model, tools, sink))

    expect(sink.results).toEqual([{ id: 'call-1', output: { error: DENIAL_MESSAGE } }])
    expect(sink.errors).toEqual([])
  })

  it('surfaces a failing tool as a tool error', async () => {
    const sink = handlers()
    const tools: ToolSet = {
      read_object: dynamicTool({
        description: 'reads',
        inputSchema: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => {
          throw new Error('object is gone')
        },
      }),
    }
    const model = new MockLanguageModelV4({
      doStream: [toolCallStream('read_object', {}), textStream('sorry')],
    })

    await runTurn(options(model, tools, sink))

    expect(sink.errors).toEqual([{ id: 'call-1', message: 'object is gone' }])
  })

  it('answers a provider failure instead of throwing', async () => {
    const sink = handlers()
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new APICallError({
          message: 'rate limited',
          statusCode: 429,
          url: 'https://node/api/v1/proxy',
          requestBodyValues: {},
          isRetryable: false,
        })
      },
    })

    const result = await runTurn({ ...options(model, {}, sink), maxSteps: 1 })

    expect(result.error).toBe('429: rate limited')
    expect(result.messages).toEqual([])
  })
})

describe('providerErrorMessage', () => {
  it('prefixes the http code of an api failure', () => {
    const error = new APICallError({
      message: 'bad request',
      statusCode: 400,
      url: 'https://node',
      requestBodyValues: {},
    })
    expect(providerErrorMessage(error)).toBe('400: bad request')
  })

  it('falls back to the plain message without a code', () => {
    expect(providerErrorMessage(new Error('offline'))).toBe('offline')
  })

  it('adds the reason the provider put in the body', () => {
    const failed = (responseBody: string) => new APICallError({
      message: 'Bad Request',
      statusCode: 400,
      url: 'https://node',
      requestBodyValues: {},
      responseBody,
    })

    expect(providerErrorMessage(failed('{"error":{"message":"max_tokens is too large","type":"invalid_request_error"}}')))
      .toBe('400: Bad Request: max_tokens is too large')
    expect(providerErrorMessage(failed('{"type":"error","message":"credit balance is too low"}')))
      .toBe('400: Bad Request: credit balance is too low')
    expect(providerErrorMessage(failed(JSON.stringify({ error: { message: 'x'.repeat(400) } }))))
      .toBe(`400: Bad Request: ${'x'.repeat(200)}`)
    // The stored reason ends at the first line, so an echoed header never lands in the chat.
    expect(providerErrorMessage(failed(JSON.stringify({ error: { message: 'no key\nAuthorization: Bearer sk-1' } }))))
      .toBe('400: Bad Request: no key')
    expect(providerErrorMessage(failed('<html>Bad Gateway</html>'))).toBe('400: Bad Request')
  })
})
