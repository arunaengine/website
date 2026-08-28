// One icon per entity kind, shared by the browser, the reference rows and the
// graph so the same thing never appears under two symbols.
import { Building2, File as FileIcon, FolderTree, Package, Tag, User } from '@lucide/vue'
import { typeLabel, type DraftEntity } from '@/lib/crate/editor'

const BY_TYPE: Record<string, typeof User> = {
  Person: User,
  Organization: Building2,
  File: FileIcon,
  MediaObject: FileIcon,
  Dataset: FolderTree,
}

export function entityIcon(entity: DraftEntity | undefined, isRoot = false) {
  if (isRoot) return Package
  for (const type of entity?.types ?? []) {
    const icon = BY_TYPE[typeLabel(type)]
    if (icon) return icon
  }
  return Tag
}
