import { describe, expect, it } from 'vitest'
import { targetProblems } from './runTarget'

describe('run target problems', () => {
  it('adds no target-specific problems for the realm', () => {
    expect(
      targetProblems({
        target: 'realm',
        dependencies: ['requests'],
        executorConstraint: 'apptainer',
        backend: 'docker',
        workspaceMode: 'existing',
        inputModes: ['floating_reference'],
        realmInputsMissingVersion: true,
        cpuCores: 8,
        ramBytes: 16_000_000_000,
        limits: { max_cpu_cores: 4, max_ram_bytes: 8_000_000_000 },
      }),
    ).toEqual([])
  })

  it('reports every incompatible local task choice', () => {
    expect(
      targetProblems({
        target: 'local',
        dependencies: ['requests'],
        executorConstraint: 'apptainer',
        backend: 'docker',
        workspaceMode: 'existing',
        inputModes: ['snapshot', 'exact_reference'],
        realmInputsMissingVersion: true,
        cpuCores: 8,
        ramBytes: 16_000_000_000,
        limits: { max_cpu_cores: 4, max_ram_bytes: 8_000_000_000 },
      }),
    ).toEqual([
      'A run on this computer has no network access, so the dependencies cannot be installed. Remove them, or run this in the realm.',
      'This computer cannot satisfy the apptainer executor constraint.',
      'An existing realm workspace cannot be used on this computer.',
      'Only snapshot inputs can run on this computer.',
      'Realm data inputs need an exact version for a local run.',
      "The CPU request is above this computer's limit.",
      "The RAM request is above this computer's limit.",
    ])
  })

  it('accepts a compatible local target when limits are not reported', () => {
    expect(
      targetProblems({
        target: 'local',
        executorConstraint: 'docker',
        backend: 'docker',
        workspaceMode: 'temporary',
        inputModes: ['snapshot'],
        limits: { max_cpu_cores: null, max_ram_bytes: null },
      }),
    ).toEqual([])
  })
})
