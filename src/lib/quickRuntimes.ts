import type { TesInput, TesTask } from '@/lib/tes'

// Script languages and the runtime catalog (tagged upstream images) of the run
// page, shared with the re-run detection in the task detail panel.

/** Editor highlighting modes; ScriptEditor accepts exactly these. */
export type ScriptHighlight = 'python' | 'javascript' | 'text'

export interface ScriptLanguage {
  id: string
  label: string
  /** Default file name, which also sets the container path of the script. */
  file: string
  /** How a command line calls it, shown as a hint under a custom image. */
  call: string
  /** Editor highlighting; anything without a mode reads as plain text. */
  highlight: ScriptHighlight
  contentType: string
}

export const SCRIPT_LANGUAGES: ScriptLanguage[] = [
  { id: 'python', label: 'Python', file: 'script.py', call: 'python', highlight: 'python', contentType: 'text/x-python' },
  { id: 'javascript', label: 'JavaScript / TypeScript', file: 'script.ts', call: 'node', highlight: 'javascript', contentType: 'text/typescript' },
  { id: 'bash', label: 'Bash', file: 'script.sh', call: 'bash', highlight: 'text', contentType: 'text/x-shellscript' },
  { id: 'perl', label: 'Perl', file: 'script.pl', call: 'perl', highlight: 'text', contentType: 'text/x-perl' },
  { id: 'r', label: 'R', file: 'script.R', call: 'Rscript', highlight: 'text', contentType: 'text/x-r' },
  { id: 'ruby', label: 'Ruby', file: 'script.rb', call: 'ruby', highlight: 'text', contentType: 'text/x-ruby' },
  { id: 'julia', label: 'Julia', file: 'script.jl', call: 'julia', highlight: 'text', contentType: 'text/x-julia' },
  { id: 'lua', label: 'Lua', file: 'script.lua', call: 'lua', highlight: 'text', contentType: 'text/x-lua' },
  { id: 'text', label: 'Plain text', file: 'script.txt', call: 'cat', highlight: 'text', contentType: 'text/plain' },
]

export function languageById(id: string): ScriptLanguage {
  return SCRIPT_LANGUAGES.find((entry) => entry.id === id) ?? SCRIPT_LANGUAGES[0]
}

export interface Runtime {
  id: 'python-uv' | 'deno' | 'bash'
  label: string
  hint: string
  image: string
  /** Argv prefix; the staged script path is appended as the last argument. */
  command: string[]
  /**
   * Extra executor environment. Values are cache dir paths RELATIVE to the
   * run's working directory, which is where it may write; the page prefixes them.
   */
  env?: Record<string, string>
  language: ScriptLanguage['id']
  /** Whether the runtime resolves declared packages at all. */
  dependencies: boolean
  template: string
}

export const RUNTIMES: Runtime[] = [
  {
    id: 'python-uv',
    label: 'Python',
    hint: 'uv · python 3.13 · packages from PyPI',
    image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim',
    command: ['uv', 'run', '--no-project'],
    env: { UV_CACHE_DIR: '.uv-cache' },
    language: 'python',
    dependencies: true,
    template: 'print("hello from aruna")\n',
  },
  {
    id: 'deno',
    label: 'JavaScript / TypeScript',
    hint: 'deno · packages from npm',
    image: 'denoland/deno:alpine-2.9.3',
    command: ['deno', 'run', '-A'],
    env: { DENO_DIR: '.deno-cache' },
    language: 'javascript',
    dependencies: true,
    template: 'console.log("hello from aruna");\n',
  },
  {
    id: 'bash',
    label: 'Bash',
    hint: 'bash 5.2 · no packages',
    image: 'bash:5.2',
    command: ['bash'],
    language: 'bash',
    dependencies: false,
    template: 'echo "hello from aruna"\n',
  },
]

export function runtimeById(id: Runtime['id']): Runtime {
  return RUNTIMES.find((runtime) => runtime.id === id) ?? RUNTIMES[0]
}

export const TES_NETWORK_TAG = 'aruna-engine.org/network'

// A task "looks like a script run" when its single executor invokes a runtime's
// interpreter on the staged script path and an input stages that script. The
// image is deliberately not compared: version bumps must not orphan old runs.
// The script path is only matched by file name, not by directory: the working
// directory is user-editable.
export function detectQuickRun(task: TesTask): { runtime: Runtime; scriptInput: TesInput } | null {
  const executor = task.executors?.length === 1 ? task.executors[0] : undefined
  if (!executor) return null
  const scriptPath = executor.command.at(-1)
  if (!scriptPath) return null
  for (const runtime of RUNTIMES) {
    if (!scriptPath.endsWith(`/${languageById(runtime.language).file}`)) continue
    if (executor.command[0] !== runtime.command[0]) continue
    const scriptInput = (task.inputs ?? []).find((input) => input.path === scriptPath)
    if (scriptInput) return { runtime, scriptInput }
  }
  return null
}
