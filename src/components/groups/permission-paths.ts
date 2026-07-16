// Shared shapes for the group permission-path browser. A group's metadata
// documents are authorized at /{realm}/g/{group}/meta/{document_path} (aruna
// operations/check_permissions), so the browsable tree mirrors the group's
// document paths one-to-one.
export interface MetaPathDocument {
  name: string
  path: string
}

export interface MetaPathFolder {
  name: string
  // Folder path without a trailing slash, e.g. 'profiles' or 'datasets/runs'.
  path: string
  folders: MetaPathFolder[]
  documents: MetaPathDocument[]
}

export function buildMetaPathTree(documentPaths: string[]): MetaPathFolder {
  const root: MetaPathFolder = { name: '', path: '', folders: [], documents: [] }
  for (const documentPath of [...documentPaths].sort()) {
    const segments = documentPath.split('/').filter(Boolean)
    if (!segments.length) continue
    const name = segments.pop() as string
    let node = root
    let prefix = ''
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment
      let child = node.folders.find((folder) => folder.name === segment)
      if (!child) {
        child = { name: segment, path: prefix, folders: [], documents: [] }
        node.folders.push(child)
      }
      node = child
    }
    node.documents.push({ name, path: documentPath })
  }
  return root
}
