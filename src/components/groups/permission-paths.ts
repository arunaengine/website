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

export function shortNodeId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id
}

// Human phrase for a role-path suffix, used by grant rows and summaries.
export function describeTarget(suffix: string): string {
  const clean = suffix.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '**' || clean === '') return 'everything in this group'
  if (clean === 'admin' || clean === 'admin/**') return 'group settings, roles and members'
  if (clean === 'meta' || clean === 'meta/**') return 'all metadata documents'
  if (clean.startsWith('meta/')) {
    const rest = clean.slice('meta/'.length)
    if (rest.endsWith('/**')) return `metadata documents in "${rest.slice(0, -3)}/"`
    return `the metadata document "${rest}"`
  }
  if (clean === 'data' || clean === 'data/**') return 'all files on every node'
  if (clean.startsWith('data/')) {
    const [node, ...tail] = clean.slice('data/'.length).split('/')
    const rest = tail.join('/')
    const where = `on node ${shortNodeId(node ?? '')}`
    if (!rest || rest === '**') return `all files ${where}`
    if (rest.endsWith('/**')) return `files in "${rest.slice(0, -3)}/" ${where}`
    return `the file "${rest}" ${where}`
  }
  return `"${clean}"`
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
