// Session runtimes the node offers for notebooks. A session names a catalog id
// and nothing else: the node fills image, entrypoint and command from its own
// catalog, so the portal only needs the label and the language.
import type { ScriptHighlight } from '@/lib/quickRuntimes'

export interface SessionRuntime {
  id: string
  label: string
  hint: string
  lang: 'python' | 'deno'
  highlight: ScriptHighlight
}

export const SESSION_RUNTIMES: SessionRuntime[] = [
  {
    id: 'python-notebook',
    label: 'Python',
    hint: 'IPython, Bash, and PyPI or Conda packages',
    lang: 'python',
    highlight: 'python',
  },
  {
    id: 'deno-notebook',
    label: 'JavaScript / TypeScript',
    hint: 'Deno kernel, packages from npm',
    lang: 'deno',
    highlight: 'javascript',
  },
]

/** Undefined for an id this portal does not know; callers say so. */
export function sessionRuntimeById(id: string): SessionRuntime | undefined {
  return SESSION_RUNTIMES.find((runtime) => runtime.id === id)
}

/** Which dependency file the runtime reads; null when it is unknown. */
export function dependencyKind(runtimeId: string): 'requirements' | 'conda' | 'deno' | null {
  const runtime = sessionRuntimeById(runtimeId)
  if (!runtime) return null
  return runtime.lang === 'deno' ? 'deno' : 'requirements'
}

/** File name the dependency list is staged under inside the container. */
export function dependencyFileName(kind: 'requirements' | 'conda' | 'deno'): string {
  return kind === 'deno' ? 'deno.json' : kind === 'conda' ? 'environment.yml' : 'requirements.txt'
}
