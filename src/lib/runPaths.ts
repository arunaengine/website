// Paths named in a run's command line and script text, checked against what the
// container filesystem actually holds. Pure: the run page turns each result into
// a chip, with a Capture or Add input action for the ones nothing covers.

export interface RunPathTargets {
  /** Working directory every relative path is resolved against. */
  workdir: string
  /** Container path of the staged script, when the run has one. */
  scriptPath?: string | null
  /** Container paths of file inputs. */
  inputs: string[]
  /** Base directories of folder inputs, with a trailing slash. */
  inputDirs?: string[]
  /** Captured container paths; a trailing slash marks a folder capture. */
  outputs: string[]
}

export type RunPathKind =
  | 'script'
  | 'input'
  | 'captured'
  | 'captured-folder'
  | 'input-folder'
  | 'missing-input'
  | 'missing-capture'

export interface RunPathCheck {
  /** Absolute container path. */
  path: string
  kind: RunPathKind
  /** Short state text shown on the chip. */
  label: string
  /** The action offered next to an unassigned path. */
  fix: 'capture' | 'input' | null
}

const SPLIT = /[\s"'`(),;|<>&]+/
// The path right after one of these commands names a folder.
const FOLDER_COMMANDS = new Set(['mkdir', 'cd'])

function normWorkdir(workdir: string): string {
  const trimmed = workdir.trim().replace(/\/+$/, '')
  return trimmed || '/work'
}

/**
 * Every container path a text names, as absolute paths. Options, URLs, bare
 * words, numbers and package specifiers are not paths and stay out. A folder ends in '/'.
 */
export function scanPaths(text: string, workdir: string): string[] {
  const base = normWorkdir(workdir)
  const found: string[] = []
  let previous = ''
  for (const raw of text.split(SPLIT)) {
    // Only a trailing slash or a folder command marks a folder; an option value may name a file.
    const folder = FOLDER_COMMANDS.has(previous)
    if (raw && !raw.startsWith('-')) previous = raw
    if (!raw || raw.startsWith('-') || raw.includes('://') || !raw.includes('/')) continue
    const token = raw.replace(/^\.\//, '').replace(/[.,:]+$/, '')
    if (!token || /^[\d./]+$/.test(token) || token.startsWith('@') || token.startsWith('jsr:')) continue
    const path = token.startsWith('/') ? token : `${base}/${token}`
    if (path !== base && !path.startsWith(`${base}/`)) continue
    found.push(folder && !path.endsWith('/') ? `${path}/` : path)
  }
  // A path with another path below it is a folder too.
  const folders = found.map((path) =>
    !path.endsWith('/') && found.some((other) => other.startsWith(`${path}/`)) ? `${path}/` : path,
  )
  return [...new Set(folders)]
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1)
}

/** Where one container path stands: covered by the run, or still unassigned. */
export function classifyPath(path: string, targets: RunPathTargets): RunPathCheck {
  const isDir = path.endsWith('/')
  // A folder named without its trailing slash, such as `ls /work/in/db`.
  const asDir = isDir ? path : `${path}/`
  if (targets.scriptPath && path === targets.scriptPath.trim()) {
    return { path, kind: 'script', label: 'script', fix: null }
  }
  if (targets.inputs.some((input) => input.trim() === path)) {
    return { path, kind: 'input', label: 'input', fix: null }
  }
  const captureDir = targets.outputs
    .map((output) => output.trim())
    .find((output) => output.endsWith('/') && path !== output && path.startsWith(output))
  if (captureDir) {
    return { path, kind: 'captured-folder', label: `captured by ${captureDir}`, fix: null }
  }
  if (targets.outputs.some((output) => output.trim() === path)) {
    return { path, kind: 'captured', label: 'captured', fix: null }
  }
  // A folder picked as its files may hold them only in subfolders, such as a database.
  const staged = targets.inputs.filter((input) => folderOf(input.trim()).startsWith(asDir)).length
  if (staged) {
    return { path, kind: 'input-folder', label: `${staged} input${staged === 1 ? '' : 's'}`, fix: null }
  }
  const inputFolder = (targets.inputDirs ?? [])
    .map((dir) => dir.trim().replace(/\/*$/, '/'))
    .find((dir) => asDir === dir || path.startsWith(dir))
  if (inputFolder) {
    return { path, kind: 'input-folder', label: asDir === inputFolder ? 'input folder' : 'in input folder', fix: null }
  }
  const inputDir = `${normWorkdir(targets.workdir)}/in/`
  if (path.startsWith(inputDir)) {
    return { path, kind: 'missing-input', label: 'not an input', fix: 'input' }
  }
  return {
    path,
    kind: 'missing-capture',
    label: isDir ? 'folder not captured' : 'not captured',
    fix: 'capture',
  }
}

/** The chips one text produces, in the order the paths appear. */
export function checkPaths(text: string, targets: RunPathTargets): RunPathCheck[] {
  return scanPaths(text, targets.workdir).map((path) => classifyPath(path, targets))
}

/** True when a check still needs a decision from the user. */
export function isUnassigned(check: RunPathCheck): boolean {
  return check.fix !== null
}
