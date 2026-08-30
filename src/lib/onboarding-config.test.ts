import { describe, expect, it } from 'vitest'
import type { RealmNodeInfo } from '@/lib/api'
import {
  buildComposeSnippet,
  buildDeviceEnv,
  buildEnvBlock,
  buildRunCommand,
  managementPortals,
  type NodeConfigInput,
} from '@/lib/onboarding-config'

function node(kind: RealmNodeInfo['kind'], api?: string): RealmNodeInfo {
  return {
    node_id: `${kind}-${api ?? 'none'}`,
    kind,
    owner: null,
    configured: true,
    present: true,
    connection_status: 'connected',
    placement: null,
    info: api ? { executors: [], labels: {}, urls: { api }, utilization: { storage_bytes_used: 0, heartbeat_at_ms: 0 }, updated_at_ms: 0 } : null,
  } as RealmNodeInfo
}

describe('management portals', () => {
  it('prefers the published list and strips the api prefix', () => {
    const portals = managementPortals({
      management_urls: ['https://a.test/api/v1', 'https://a.test/api/v1/', 'https://b.test/api/v1'],
      nodes: [node('management', 'https://c.test/api/v1')],
    })
    expect(portals.map((portal) => portal.url)).toEqual(['https://a.test', 'https://b.test'])
  })

  it('falls back to the node list of an older backend', () => {
    const portals = managementPortals({ nodes: [node('server', 'https://s.test/api/v1'), node('management', 'https://m.test/api/v1'), node('management')] })
    expect(portals.map((portal) => portal.url)).toEqual(['https://m.test'])
  })

  it('answers nothing for no realm info', () => {
    expect(managementPortals(null)).toEqual([])
  })
})

const base: NodeConfigInput = {
  secret: 'plain-secret',
  httpPort: 3000,
  p2pPort: 3001,
  s3Port: 1337,
  dataDir: './aruna-data',
}

const DEFAULT_KEYS = [
  'STORAGE_PATH',
  'SOCKET_ADDRESS',
  'P2P_SOCKET_ADDRESS',
  'S3_HOST',
  'S3_ADDRESS',
  'ONBOARDING_SECRET',
  'RUST_LOG',
]

function envKeys(block: string): string[] {
  return [...block.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1])
}

function composeKeys(snippet: string): string[] {
  return [...snippet.matchAll(/^ {6}([A-Z0-9_]+):/gm)].map((match) => match[1])
}

function runKeys(command: string): string[] {
  return [...command.matchAll(/-e ([A-Z0-9_]+)=/g)].map((match) => match[1])
}

describe('node config', () => {
  it('emits the optional keys only when set', () => {
    expect(envKeys(buildEnvBlock(base))).toEqual(DEFAULT_KEYS)

    const block = buildEnvBlock({
      ...base,
      apiPublicUrl: '  https://node.test  ',
      s3PublicUrl: 'https://s3.test',
      logLevel: 'debug',
      opsPort: 3102,
    })
    expect(block).toContain('OPS_SOCKET_ADDRESS=127.0.0.1:3102')
    expect(block).toContain('API_PUBLIC_URL=https://node.test')
    expect(block).toContain('S3_PUBLIC_URL=https://s3.test')
    expect(block).toContain('RUST_LOG=debug')
    expect(block).not.toContain('RUST_LOG=info')
  })

  it('keeps the device agent on the default keys', () => {
    // Enrolling a laptop must not start shipping node-operator settings.
    expect(envKeys(buildDeviceEnv({ secret: 'device-secret' }))).toEqual(DEFAULT_KEYS)
  })

  it('runs the same configuration as the compose file', () => {
    const input: NodeConfigInput = {
      ...base,
      apiPublicUrl: 'https://node.test',
      s3PublicUrl: 'https://s3.test',
      logLevel: 'debug',
      opsPort: 3102,
      location: 'eu-west',
      weight: 2,
      labels: 'rack=a1',
    }
    const command = buildRunCommand(input)

    expect(runKeys(command)).toEqual(composeKeys(buildComposeSnippet(input)))
    expect(runKeys(command)).toEqual(envKeys(buildEnvBlock(input)))
    expect(command.startsWith('docker run -d --name aruna')).toBe(true)
    expect(command).toContain('--network host')
    expect(command).toContain('--restart unless-stopped')
    expect(command).toContain('-v ./aruna-data:/data')
    expect(command.endsWith('aruna:latest')).toBe(true)
    expect(command).toContain('-e RUST_LOG=debug')
  })

  it('quotes the secret and every unsafe value', () => {
    const command = buildRunCommand({
      ...base,
      secret: "s3cr!t $x 'q'",
      dataDir: '/srv/aruna data',
      labels: 'note=hello world',
    })

    expect(command).toContain(`-e ONBOARDING_SECRET='s3cr!t $x '\\''q'\\'''`)
    expect(command).toContain(`-v '/srv/aruna data:/data'`)
    expect(command).toContain(`-e ARUNA_NODE_LABELS='note=hello world'`)
    expect(command).toContain('-e SOCKET_ADDRESS=0.0.0.0:3000')
    // A harmless secret is quoted too, so the rule never depends on its content.
    expect(buildRunCommand(base)).toContain("-e ONBOARDING_SECRET='plain-secret'")
  })
})
