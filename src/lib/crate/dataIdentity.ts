// One decision for the identity of a picked object (decision Q15): the content
// w3id the node resolves it to, so search and backlinks find it, with the
// bucket location in contentUrl. Offline, or when the node cannot answer, the
// location is the identity. The picker and the upload path both come here.

import {
  arunaContentReference,
  resolveContentIdentity,
  type ContentIdentityOptions,
} from '@/lib/contentIdentity'

export interface DataEntityIdentity {
  /** The entity's `@id`: the content w3id when resolvable, else the location. */
  id: string
  /** Where the bytes are, always written so a reader can resolve either form. */
  contentUrl: string
}

export function objectLocation(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`
}

export async function dataEntityIdentity(
  bucket: string,
  key: string,
  options: ContentIdentityOptions = {},
): Promise<DataEntityIdentity> {
  const contentUrl = objectLocation(bucket, key)
  const resolved = arunaContentReference(contentUrl, await resolveContentIdentity(bucket, key, options))
  return { id: resolved.id, contentUrl }
}
