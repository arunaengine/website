// The bucket names the portal has already listed. A link is only offered for a
// name found here, so a word that merely looks like a bucket stays prose.
import { shallowRef } from 'vue'

const names = shallowRef<ReadonlySet<string>>(new Set())

/** Replaces the set with the names of the buckets the portal just listed. */
export function setKnownBuckets(list: Iterable<string>): void {
  names.value = new Set(list)
}

export function isKnownBucket(name: string): boolean {
  return names.value.has(name)
}
