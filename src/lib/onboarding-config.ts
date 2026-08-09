// Pure, unit-testable helpers that render a joining node's configuration
// (aruna#277). They emit ONLY the environment keys verified against
// aruna/src/config.rs::load and the shipped deploy scripts — no invented keys.
//
// Deliberately NOT emitted: realm-level settings such as the realm description
// and the OIDC provider list. Those are realm-scoped and are synced to the
// joining node during onboarding, so setting them on a new node is wrong (see
// aruna/src/config.rs, where they only apply when a node initializes a realm).

export interface NodeConfigInput {
  // The minted onboarding secret; ONBOARDING_SECRET on first boot triggers a
  // realm join instead of realm init.
  secret: string
  httpPort: number // → SOCKET_ADDRESS (REST bind)
  p2pPort: number // → P2P_SOCKET_ADDRESS (deploy scripts always set a distinct port)
  s3Port: number // → S3_HOST + S3_ADDRESS
  dataDir: string // compose host volume mounted at /data
  location?: string // → ARUNA_NODE_LOCATION
  weight?: number // → ARUNA_NODE_WEIGHT
  labels?: string // → ARUNA_NODE_LABELS, raw 'k=v,k2=v2'
}

// Trim, drop trailing slashes, and drop one trailing '/api/v1': the node appends
// /api/v1/onboarding/bootstrap itself (aruna/src/config.rs), so seed_url must be
// an origin-style URL without the API prefix.
export function normalizeSeedUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  return trimmed.replace(/\/api\/v1$/, '').replace(/\/+$/, '')
}

// Optional placement hints, appended only when the admin set them. Weight must
// be a finite number; blank location/labels are skipped.
function optionalEnvLines(input: NodeConfigInput, format: (key: string, value: string) => string): string[] {
  const lines: string[] = []
  if (input.location?.trim()) lines.push(format('ARUNA_NODE_LOCATION', input.location.trim()))
  if (input.weight != null && Number.isFinite(input.weight)) lines.push(format('ARUNA_NODE_WEIGHT', String(input.weight)))
  if (input.labels?.trim()) lines.push(format('ARUNA_NODE_LABELS', input.labels.trim()))
  return lines
}

// dotenv-style block for `.env` / process env. dotenvy accepts '#' comments.
export function buildEnvBlock(input: NodeConfigInput): string {
  const lines = [
    '# Aruna node — realm join configuration',
    'STORAGE_PATH=/data',
    `SOCKET_ADDRESS=0.0.0.0:${input.httpPort}`,
    `P2P_SOCKET_ADDRESS=0.0.0.0:${input.p2pPort}`,
    `S3_HOST=0.0.0.0:${input.s3Port}`,
    `S3_ADDRESS=0.0.0.0:${input.s3Port}`,
    `ONBOARDING_SECRET=${input.secret}`,
    'RUST_LOG=info',
    ...optionalEnvLines(input, (key, value) => `${key}=${value}`),
  ]
  return lines.join('\n')
}

// docker compose snippet mirroring the shipped scripts/compose.yaml: host
// networking, a /data volume, env via `environment:` (dotenvy::var falls back to
// process env, so this works identically to an .env file).
export function buildComposeSnippet(input: NodeConfigInput): string {
  const dataDir = input.dataDir.trim() || './aruna-data'
  const env = [
    '      STORAGE_PATH: /data',
    `      SOCKET_ADDRESS: "0.0.0.0:${input.httpPort}"`,
    `      P2P_SOCKET_ADDRESS: "0.0.0.0:${input.p2pPort}"`,
    `      S3_HOST: "0.0.0.0:${input.s3Port}"`,
    `      S3_ADDRESS: "0.0.0.0:${input.s3Port}"`,
    `      ONBOARDING_SECRET: "${input.secret}"`,
    '      RUST_LOG: info',
    ...optionalEnvLines(input, (key, value) => `      ${key}: "${value}"`),
  ]
  return [
    'services:',
    '  aruna:',
    '    image: aruna:latest   # docker build -t aruna:latest . in the aruna repo',
    '    network_mode: host',
    '    restart: unless-stopped',
    '    volumes:',
    `      - ${dataDir}:/data`,
    '    environment:',
    ...env,
  ].join('\n')
}

// --- User device agent (aruna#271) ------------------------------------------

export interface DeviceEnvInput {
  secret: string // the one-time device token (aruna#271)
  dataDir?: string // default './aruna-device-data'
  httpPort?: number // default 3000
  p2pPort?: number // default 3001
  s3Port?: number // default 1337
  deviceName?: string // emitted as ARUNA_NODE_LABELS=device=<slug> when set
}

// ARUNA_NODE_LABELS is a verified k=v map; slug the device name so it is a valid
// label value and recognizable on StatusView.
function slugLabel(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '')
}

// Device-agent .env for enrolling a laptop as a 'user' node (aruna#271). Reuses
// buildEnvBlock — the device runs the same aruna binary, and
// STORAGE_PATH/SOCKET_ADDRESS/S3_HOST/S3_ADDRESS are required by its config
// loader even on a personal device. No new env keys are introduced (so the
// key-allowlist grep over this module still covers everything).
export function buildDeviceEnv(input: DeviceEnvInput): string {
  const slug = input.deviceName ? slugLabel(input.deviceName) : ''
  const node: NodeConfigInput = {
    secret: input.secret,
    httpPort: input.httpPort ?? 3000,
    p2pPort: input.p2pPort ?? 3001,
    s3Port: input.s3Port ?? 1337,
    dataDir: input.dataDir?.trim() || './aruna-device-data',
    labels: slug ? `device=${slug}` : undefined,
  }
  const header = [
    '# Aruna user device — self-service enrollment (aruna#271)',
    "# This device joins as a 'user' node: bound to your account at enrollment,",
    '# never mints tokens, never serves as a replication or routing target.',
  ].join('\n')
  return `${header}\n${buildEnvBlock(node)}`
}
