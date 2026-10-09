// Import a dataset from another realm into this one. This realm signs an intent, the source
// realm's popup exports and signs a grant, then this realm pulls the artifact. When it
// cannot reach the source, the source pushes; when neither server reaches the other, a
// metadata only artifact comes through the popup. The browser never carries file bytes.
import { ref, shallowRef } from 'vue'
import {
  ApiError,
  apiErrorMessage,
  createImport,
  createImportIntent,
  getRealmDescriptor,
  uploadTransfer,
  type ApiClientOptions,
  type ImportIntent,
  type PushAnswer,
} from '@/lib/api'
import type { Signed, RealmDescriptor, VerifiedRealm } from '@/lib/federation/descriptor'
import { HandshakeError, type PopupChannel } from '@/lib/federation/handshake'
import { IMPORT_TIMEOUT_MS, openPopup, popupFailure, type ExportAnswer } from '@/lib/federation/popup'
import { recheckRealm } from '@/lib/federation/realms'
import { newSecret } from '@/lib/federation/secret'
import { checkOwnerNode, importKey, OwnerNodeError } from '@/lib/federation/transfer'
import { submitImport, type SubmitImportResponse } from '@/lib/rocrateArchive'
import { assertCurrentSession, refreshContext } from './aruna/state'

export interface RealmImportForm {
  home: VerifiedRealm
  groupId: string
  groupName: string
  bucket: string
  prefix: string
  metadataPath: string
}

export type ImportPhase = 'idle' | 'preparing' | 'choosing' | 'copying' | 'started' | 'failed'

const NO_COPY = 'The realms cannot copy files to each other.'

export class ImportStop extends Error {
  name = 'ImportStop'
}

export function importFailure(error: unknown, form: RealmImportForm): string {
  const popup = popupFailure(error, 'import')
  if (popup) return popup
  if (error instanceof ApiError && error.code === 'import_denied') return `You cannot import into ${form.groupName}.`
  if (error instanceof ApiError && error.code === 'federation_disabled') {
    return 'This realm does not take imports from other realms.'
  }
  if (error instanceof ApiError && error.code === 'source_refused') return `${form.home.name} refused the copy.`
  if (error instanceof ImportStop || error instanceof OwnerNodeError) return error.message
  return apiErrorMessage(error)
}

export function useRealmImport() {
  const phase = ref<ImportPhase>('idle')
  const failure = ref<string | null>(null)
  const submitted = shallowRef<SubmitImportResponse | null>(null)
  const jobClient = shallowRef<ApiClientOptions | null>(null)
  const files = ref<number | null>(null)
  // A failed file copy may be retried, or redone as metadata only.
  const canRetry = ref(false)
  let attempt = 0
  let channel: PopupChannel | null = null
  let pending: {
    form: RealmImportForm
    intent: Signed<ImportIntent>
    descriptor: Signed<RealmDescriptor>
    answer: ExportAnswer
    secret: string
  } | null = null

  function closeChannel() {
    channel?.close()
    channel = null
  }

  function current(run: number, epoch: number) {
    if (run !== attempt) throw new DOMException('A newer import started.', 'AbortError')
    assertCurrentSession(epoch)
  }

  function finish(run: number, epoch: number, result: SubmitImportResponse, client: ApiClientOptions) {
    current(run, epoch)
    submitted.value = result
    jobClient.value = client
    phase.value = 'started'
    closeChannel()
  }

  async function transfer(run: number) {
    const context = refreshContext()
    const state = pending
    if (!state || !channel) throw new ImportStop('Start the import again.')
    const { form, intent, answer, secret, descriptor } = state
    phase.value = 'copying'
    try {
      const result = await createImport({ intent, grant: answer.grant, secret }, context.client)
      return await finish(run, context.epoch, result, context.client)
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'pull_unreachable')) throw error
    }
    // The same key as a pull would use, so a retry or a new consent finds the same job.
    const key = await importKey(answer.grant.payload, intent.payload.destination)
    current(run, context.epoch)
    const target = { bucket: form.bucket, prefix: form.prefix }
    const metadata = { group_id: form.groupId, path: form.metadataPath, public: false }
    let pushed: PushAnswer | null = null
    try {
      pushed = await channel.ask<PushAnswer>({ kind: 'push' })
    } catch (error) {
      // Only an unreachable destination leaves the metadata to come through this window.
      if (!(error instanceof HandshakeError && error.code === 'push_unreachable')) throw error
      if (answer.files > 0) {
        canRetry.value = true
        throw new ImportStop(NO_COPY)
      }
    }
    current(run, context.epoch)
    if (pushed) {
      // Checked against this realm's own node list before any bearer goes there.
      const owner = await checkOwnerNode(pushed.owner_node_url, descriptor.payload.api_url, context.client.token ?? '')
      current(run, context.epoch)
      const client = { baseUrl: owner, token: context.client.token }
      const source = { kind: 'upload' as const, upload_id: pushed.upload_id }
      const result = await submitImport({ source, target, metadata, idempotency_key: key }, client)
      return finish(run, context.epoch, result, client)
    }
    const bytes = await channel.ask<ArrayBuffer>({ kind: 'artifact' })
    current(run, context.epoch)
    const upload = await uploadTransfer(bytes, { intent, grant: answer.grant }, context.client)
    current(run, context.epoch)
    const source = { kind: 'upload' as const, upload_id: upload.upload_id }
    const result = await submitImport({ source, target, metadata, idempotency_key: key }, context.client)
    return finish(run, context.epoch, result, context.client)
  }

  async function guarded(run: number, form: RealmImportForm, task: () => Promise<void>) {
    try {
      await task()
    } catch (error) {
      if (run !== attempt || (error instanceof DOMException && error.name === 'AbortError')) return
      phase.value = 'failed'
      failure.value = importFailure(error, form)
      if (!canRetry.value) closeChannel()
    }
  }

  /** Signs the intent here, then opens the source realm to choose and send the dataset. */
  async function start(form: RealmImportForm) {
    const run = ++attempt
    closeChannel()
    pending = null
    failure.value = null
    submitted.value = null
    canRetry.value = false
    files.value = null
    phase.value = 'preparing'
    await guarded(run, form, async () => {
      const context = refreshContext()
      const { secret, nonce } = await newSecret()
      const destination = { group_id: form.groupId, bucket: form.bucket, prefix: form.prefix, metadata_path: form.metadataPath }
      const [intent, descriptor, source] = await Promise.all([
        createImportIntent({ ...destination, nonce }, context.client),
        getRealmDescriptor(context.client),
        recheckRealm(form.home),
      ])
      current(run, context.epoch)
      phase.value = 'choosing'
      channel = openPopup(window, source, IMPORT_TIMEOUT_MS)
      const answer = await channel.ask<ExportAnswer>({ kind: 'export', descriptor, intent })
      current(run, context.epoch)
      files.value = answer.files
      pending = { form, intent, descriptor, answer, secret }
      await transfer(run)
    })
  }

  /** Tries the file copy again while the source window is still open. */
  async function retry() {
    const state = pending
    if (!state) return
    const run = ++attempt
    failure.value = null
    canRetry.value = false
    await guarded(run, state.form, () => transfer(run))
  }

  function reset() {
    attempt++
    closeChannel()
    pending = null
    phase.value = 'idle'
    failure.value = null
    submitted.value = null
    canRetry.value = false
  }

  return { phase, failure, submitted, jobClient, files, canRetry, start, retry, reset }
}
