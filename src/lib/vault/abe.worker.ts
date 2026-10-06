// The key worker: imported keys stay here as handles and end with the worker.
import init, { type ScopedKey } from './kpabe/kpabe'
import wasmUrl from './kpabe/kpabe_bg.wasm?url'
import { importGrant, issueGrant, openObject, type EnvelopeInput, type GrantInput, type IssueInput } from './abe'

export type KeyWorkerRequest = { id: number } & (
  | { op: 'import'; input: GrantInput }
  | { op: 'open'; handle: number; input: EnvelopeInput }
  | { op: 'issue'; input: IssueInput }
)

export type KeyWorkerReply = { id: number } & ({ value: unknown } | { error: string })

interface WorkerScope {
  onmessage: ((event: MessageEvent<KeyWorkerRequest>) => void) | null
  postMessage(message: KeyWorkerReply, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope
const keys = new Map<number, ScopedKey>()
const ready = init({ module_or_path: wasmUrl })
let handles = 0

async function answer(request: KeyWorkerRequest): Promise<[unknown, Transferable[]]> {
  await ready
  if (request.op === 'import') {
    handles += 1
    keys.set(handles, await importGrant(request.input))
    return [handles, []]
  }
  if (request.op === 'issue') return [await issueGrant(request.input), []]
  const key = keys.get(request.handle)
  if (!key) throw new Error('The key is no longer open.')
  const objectKey = await openObject(key, request.input)
  return [objectKey, [objectKey.buffer]]
}

scope.onmessage = ({ data }) => {
  answer(data).then(
    ([value, transfer]) => scope.postMessage({ id: data.id, value }, transfer),
    (cause: unknown) => scope.postMessage({ id: data.id, error: cause instanceof Error ? cause.message : String(cause) }),
  )
}
