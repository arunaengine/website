// A bucket the desktop may bind to a folder. The bind route only takes a bucket
// on a realm node, named by explicit ids: the connected node of this window can
// be the computer's own user node, which is never a source for itself.
import { isWorkspaceBucket } from '@/lib/workspaces'

export interface BindSource {
  bucket: string
  nodeId: string
  groupId: string
}

export function bindSource(
  nodes: ReadonlyArray<{ nodeId: string; kind: string }>,
  bucket: string | null | undefined,
  nodeId: string | null | undefined,
  groupId: string | null | undefined,
): BindSource | null {
  if (!bucket || !nodeId || !groupId || isWorkspaceBucket(bucket)) return null
  const host = nodes.find((node) => node.nodeId === nodeId)
  return host && host.kind !== 'user' ? { bucket, nodeId, groupId } : null
}
