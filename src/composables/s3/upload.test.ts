import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'

const sent: unknown[] = []
let respond: (command: unknown) => Promise<unknown>

const fakeClient = {
  config: {
    requestChecksumCalculation: async () => 'WHEN_REQUIRED',
    forcePathStyle: true,
    endpoint: async () => ({ protocol: 'https:', hostname: 's3.test', port: undefined, path: '/' }),
  },
  send: (command: unknown) => {
    sent.push(command)
    return respond(command)
  },
}

vi.mock('./client', () => ({ client: () => fakeClient }))

const { UPLOAD_PART_SIZE, uploadObject } = await import('./objects')

function payload(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'payload.bin', { type: 'application/octet-stream' })
}

function of<T>(type: new (...args: never[]) => T): T[] {
  return sent.filter((command): command is T => command instanceof type)
}

function networkError(): Error {
  return Object.assign(new Error('Failed to fetch'), { name: 'TypeError' })
}

function s3Error(code: string, status: number): Error {
  return Object.assign(new Error(`${code} from the node`), {
    name: code,
    $metadata: { httpStatusCode: status },
  })
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// Answers the multipart calls, letting the caller decide each completion.
function multipart(completions: (() => Promise<unknown>)[], fallback?: () => Promise<unknown>) {
  let index = 0
  respond = (command) => {
    if (command instanceof CreateMultipartUploadCommand) return Promise.resolve({ UploadId: 'upload-1' })
    if (command instanceof UploadPartCommand) {
      return Promise.resolve({ ETag: `"part-${command.input.PartNumber}"` })
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      const next = completions[index++] ?? fallback
      if (!next) throw new Error('unexpected completion')
      return next()
    }
    return Promise.resolve({})
  }
}

describe('multipart upload completion', () => {
  beforeEach(() => {
    sent.length = 0
    respond = async () => ({})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('repeats a lost completion without uploading the parts again', async () => {
    const first = deferred()
    multipart([
      () => {
        first.resolve()
        return Promise.reject(networkError())
      },
      () => Promise.resolve({ ETag: '"object"' }),
    ])
    const retries: number[] = []
    const handle = uploadObject(
      'bucket',
      'key',
      payload(UPLOAD_PART_SIZE + 1),
      undefined,
      null,
      undefined,
      (attempt) => retries.push(attempt),
    )

    await first.promise
    await vi.advanceTimersByTimeAsync(2000)
    await expect(handle.promise).resolves.toBeUndefined()

    const completions = of(CompleteMultipartUploadCommand)
    expect(of(UploadPartCommand)).toHaveLength(2)
    expect(completions).toHaveLength(2)
    expect(completions[1]?.input).toEqual(completions[0]?.input)
    expect(completions[1]?.input.MultipartUpload?.Parts).toHaveLength(2)
    expect(completions[1]?.input.UploadId).toBe('upload-1')
    expect(of(AbortMultipartUploadCommand)).toHaveLength(0)
    expect(retries).toEqual([2])
  })

  it('waits out a completion the node is already running', async () => {
    // OperationAborted means the node holds an in-flight completion for this
    // upload id; the retry joins it.
    const first = deferred()
    multipart([
      () => {
        first.resolve()
        return Promise.reject(s3Error('OperationAborted', 409))
      },
      () => Promise.resolve({ ETag: '"object"' }),
    ])
    const handle = uploadObject('bucket', 'key', payload(UPLOAD_PART_SIZE + 1))

    await first.promise
    await vi.advanceTimersByTimeAsync(2000)
    await expect(handle.promise).resolves.toBeUndefined()
    expect(of(CompleteMultipartUploadCommand)).toHaveLength(2)
    expect(of(UploadPartCommand)).toHaveLength(2)
  })

  it('drops the parts when the completion fails for good', async () => {
    multipart([() => Promise.reject(s3Error('NoSuchUpload', 404))])
    respond = ((inner) => (command: unknown) => {
      // The node may already have forgotten the upload; the abort still fails
      // silently rather than replacing the reason the upload failed.
      if (command instanceof AbortMultipartUploadCommand) {
        return Promise.reject(s3Error('NoSuchUpload', 404))
      }
      return inner(command)
    })(respond)
    const handle = uploadObject('bucket', 'key', payload(UPLOAD_PART_SIZE + 1))

    await expect(handle.promise).rejects.toMatchObject({ name: 'NoSuchUpload' })
    expect(of(CompleteMultipartUploadCommand)).toHaveLength(1)
    expect(of(AbortMultipartUploadCommand)[0]?.input).toMatchObject({
      Bucket: 'bucket',
      Key: 'key',
      UploadId: 'upload-1',
    })
  })

  it('stops retrying and aborts when the upload is canceled', async () => {
    const first = deferred()
    multipart([
      () => {
        first.resolve()
        return Promise.reject(networkError())
      },
    ])
    const handle = uploadObject('bucket', 'key', payload(UPLOAD_PART_SIZE + 1))
    const failure = handle.promise.catch((err) => err)

    await first.promise
    await handle.abort()
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(failure).resolves.toBeTruthy()
    expect(of(CompleteMultipartUploadCommand)).toHaveLength(1)
    expect(of(AbortMultipartUploadCommand)).toHaveLength(1)
  })

  it('gives up once the retry window is spent', async () => {
    multipart([], () => Promise.reject(s3Error('OperationAborted', 409)))
    const handle = uploadObject('bucket', 'key', payload(UPLOAD_PART_SIZE + 1))
    let settled = false
    const failure = handle.promise.catch((err) => err).finally(() => {
      settled = true
    })

    const started = Date.now()
    for (let round = 0; round < 15 && !settled; round += 1) {
      await vi.advanceTimersByTimeAsync(60_000)
    }

    await expect(failure).resolves.toMatchObject({ name: 'OperationAborted' })
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(9 * 60 * 1000)
    expect(elapsed).toBeLessThanOrEqual(11 * 60 * 1000)
    const attempts = of(CompleteMultipartUploadCommand).length
    expect(attempts).toBeGreaterThan(5)
    expect(attempts).toBeLessThan(30)
    // The node is still assembling the object, so the parts must survive.
    expect(of(AbortMultipartUploadCommand)).toHaveLength(0)
  })

  it('sends one PutObject for a file below the part size', async () => {
    respond = async () => ({ ETag: '"object"' })
    const handle = uploadObject('bucket', 'key', payload(1024))

    await expect(handle.promise).resolves.toBeUndefined()
    expect(of(PutObjectCommand)).toHaveLength(1)
    expect(of(CreateMultipartUploadCommand)).toHaveLength(0)
    expect(of(CompleteMultipartUploadCommand)).toHaveLength(0)
  })
})

describe('completion answered with an error inside a 200 response', () => {
  // The node keeps the connection alive by streaming whitespace before it knows
  // the outcome, so a failure arrives with status 200 and an <Error> body.
  function clientAnswering(body: string): S3Client {
    return new S3Client({
      region: 'us-east-1',
      endpoint: 'https://s3.test',
      forcePathStyle: true,
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      maxAttempts: 1,
      requestHandler: {
        handle: async () => ({
          response: {
            statusCode: 200,
            reason: 'OK',
            headers: { 'content-type': 'application/xml' },
            body: new TextEncoder().encode(body),
          },
        }),
      } as never,
    })
  }

  const completion = new CompleteMultipartUploadCommand({
    Bucket: 'bucket',
    Key: 'key',
    UploadId: 'upload-1',
  })

  it('rejects with the code the node put in the body', async () => {
    const s3 = clientAnswering(
      '<?xml version="1.0" encoding="UTF-8"?>\n   \n   \n<Error><Code>OperationAborted</Code>' +
        '<Message>The upload is being completed, retry shortly.</Message></Error>',
    )

    await expect(s3.send(completion)).rejects.toMatchObject({
      name: 'OperationAborted',
      message: 'The upload is being completed, retry shortly.',
    })
  })

  it('reads a result that follows the same keepalive whitespace', async () => {
    const s3 = clientAnswering(
      '<?xml version="1.0" encoding="UTF-8"?>\n   \n<CompleteMultipartUploadResult>' +
        '<Bucket>bucket</Bucket><Key>key</Key><ETag>"object"</ETag></CompleteMultipartUploadResult>',
    )

    await expect(s3.send(completion)).resolves.toMatchObject({ Key: 'key', ETag: '"object"' })
  })
})
