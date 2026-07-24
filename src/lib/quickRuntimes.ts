import type { TesInput, TesTask } from '@/lib/tes'

// Quick-run runtime catalog (tagged upstream images), shared between the
// quick-run wizard and the re-run detection in the task detail panel.

export interface Runtime {
  id: 'python-uv' | 'deno' | 'bash'
  label: string
  hint: string
  image: string
  /** Argv prefix; the staged script path is appended as the last argument. */
  command: string[]
  /** Extra executor environment (e.g. cache dirs inside the writable /work). */
  env?: Record<string, string>
  file: string
  lang: 'python' | 'javascript' | 'text'
  contentType: string
  template: string
}

export const RUNTIMES: Runtime[] = [
  {
    id: 'python-uv',
    label: 'Python',
    hint: 'PyPI dependencies managed by uv.',
    image: 'ghcr.io/astral-sh/uv:python3.13-bookworm-slim',
    command: ['uv', 'run', '--no-project'],
    env: { UV_CACHE_DIR: '/work/.uv-cache' },
    file: 'script.py',
    lang: 'python',
    contentType: 'text/x-python',
    template: 'print("hello from aruna")\n',
  },
  {
    id: 'deno',
    label: 'JavaScript / TypeScript',
    hint: 'npm dependencies resolved by Deno.',
    image: 'denoland/deno:alpine-2.9.3',
    command: ['deno', 'run', '-A'],
    env: { DENO_DIR: '/work/.deno-cache' },
    file: 'script.ts',
    lang: 'javascript',
    contentType: 'text/typescript',
    template: 'console.log("hello from aruna");\n',
  },
  {
    id: 'bash',
    label: 'Bash',
    hint: 'Plain shell, no extra tooling.',
    image: 'bash:5.2',
    command: ['bash'],
    file: 'script.sh',
    lang: 'text',
    contentType: 'text/x-shellscript',
    template: 'echo "hello from aruna"\n',
  },
]

export const TES_NETWORK_TAG = 'aruna-engine.org/network'

// A task "looks like a quick run" when its single executor invokes a runtime's
// interpreter on the staged script path and an input stages that script. The
// image is deliberately not compared: version bumps must not orphan old runs.
export function detectQuickRun(task: TesTask): { runtime: Runtime; scriptInput: TesInput } | null {
  const executor = task.executors?.length === 1 ? task.executors[0] : undefined
  if (!executor) return null
  for (const runtime of RUNTIMES) {
    const scriptPath = `/work/${runtime.file}`
    if (executor.command.at(-1) !== scriptPath) continue
    if (executor.command[0] !== runtime.command[0]) continue
    const scriptInput = (task.inputs ?? []).find((input) => input.path === scriptPath)
    if (scriptInput) return { runtime, scriptInput }
  }
  return null
}
