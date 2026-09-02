import type { InputModeRequest } from '@/lib/jobs'

export interface RunTargetProblemInput {
  target: 'realm' | 'local'
  dependencies?: readonly string[]
  executorConstraint?: string | null
  backend?: string | null
  inputModes?: readonly InputModeRequest[]
  realmInputsMissingVersion?: boolean
  cpuCores?: number
  ramBytes?: number
  limits?: {
    max_cpu_cores: number | null
    max_ram_bytes: number | null
  } | null
}

export function targetProblems(input: RunTargetProblemInput): string[] {
  if (input.target === 'realm') return []

  const problems: string[] = []
  if (input.dependencies?.length) {
    problems.push(
      'A run on this computer has no network access, so the dependencies cannot be installed. Remove them, or run this in the realm.',
    )
  }

  const constraint = input.executorConstraint?.trim()
  const backend = input.backend?.trim() ?? ''
  if (constraint && constraint !== backend) {
    problems.push(`This computer cannot satisfy the ${constraint} executor constraint.`)
  }
  if (input.inputModes?.some((mode) => mode !== 'snapshot')) {
    problems.push('Only snapshot inputs can run on this computer.')
  }
  if (input.realmInputsMissingVersion) {
    problems.push('Realm data inputs need an exact version for a local run.')
  }

  const cpuLimit = input.limits?.max_cpu_cores
  if (cpuLimit != null && input.cpuCores != null && input.cpuCores > cpuLimit) {
    problems.push("The CPU request is above this computer's limit.")
  }
  const ramLimit = input.limits?.max_ram_bytes
  if (ramLimit != null && input.ramBytes != null && input.ramBytes > ramLimit) {
    problems.push("The RAM request is above this computer's limit.")
  }

  return problems
}
