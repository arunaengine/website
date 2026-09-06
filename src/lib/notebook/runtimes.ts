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
    hint: 'ipykernel, packages from PyPI',
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

export function sessionRuntimeById(id: string): SessionRuntime {
  return SESSION_RUNTIMES.find((runtime) => runtime.id === id) ?? SESSION_RUNTIMES[0]
}

/** Which dependency file the runtime reads. */
export function dependencyKind(runtimeId: string): 'requirements' | 'deno' {
  return sessionRuntimeById(runtimeId).lang === 'deno' ? 'deno' : 'requirements'
}

/** File name the dependency list is staged under inside the container. */
export function dependencyFileName(kind: 'requirements' | 'deno'): string {
  return kind === 'deno' ? 'deno.json' : 'requirements.txt'
}
