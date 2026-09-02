// The made-up realm the tutorials work in: one group, two buckets, a dataset
// folder with two versioned input files, and the four artifacts a finished run
// leaves behind. Nothing here exists on any node.
import type { BucketEntry, FolderEntry, ObjectEntry, ObjectHead } from '@/composables/useS3'

export const TUTORIAL_GROUP = { id: 'tutorial-group', name: 'Tutorial group' }
export const TUTORIAL_NODE_ID = 'tutorial-node'
export const TUTORIAL_ENDPOINT = 'https://tutorial.invalid/s3'
export const INPUT_BUCKET = 'tutorial-readings'
export const RESULT_BUCKET = 'tutorial-results'
export const DATASET_PREFIX = 'survey-2026/'

export const TUTORIAL_BUCKETS: BucketEntry[] = [{ name: INPUT_BUCKET }, { name: RESULT_BUCKET }]

/** Version ids the inputs pin to, so the wizard can teach exact references. */
export const INPUT_VERSIONS: Record<string, string> = {
  [`${DATASET_PREFIX}station-a.csv`]: '01TUTORIALVERSIONA0000000',
  [`${DATASET_PREFIX}station-b.csv`]: '01TUTORIALVERSIONB0000000',
}

export const DATASET_FOLDER: FolderEntry = { prefix: DATASET_PREFIX, name: 'survey-2026' }

export const INPUT_OBJECTS: ObjectEntry[] = [
  { key: `${DATASET_PREFIX}station-a.csv`, name: 'station-a.csv', size: 2048 },
  { key: `${DATASET_PREFIX}station-b.csv`, name: 'station-b.csv', size: 3072 },
]

// A 32x32 checkerboard, the smallest honest PNG to prove the image path.
const PLOT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAOklEQVR42mNQiNqCFX348gsrIlU9w6gFoxYMAQuoZRAu9aMWjFowFCwYLSpGLRi1YLQ+GLVg1AIgAgAwPRh5/lKX4wAAAABJRU5ErkJggg=='

export const SUMMARY_JSON = JSON.stringify(
  {
    stations: 2,
    readings: 1440,
    mean_temperature_c: 11.4,
    generated_by: 'tutorial-run',
  },
  null,
  2,
)

export const RUN_LOG_TEXT = [
  'reading s3://tutorial-readings/survey-2026/station-a.csv',
  'reading s3://tutorial-readings/survey-2026/station-b.csv',
  'merged 1440 readings from 2 stations',
  'wrote /outputs/summary.json',
  'wrote /outputs/plot.png',
].join('\n')

export interface TutorialArtifact {
  key: string
  name: string
  size: number
  contentType: string
  /** Text artifacts serve this; the image serves its decoded bytes. */
  text?: string
}

export const RESULT_ARTIFACTS: TutorialArtifact[] = [
  { key: 'runs/plot.png', name: 'plot.png', size: 115, contentType: 'image/png' },
  { key: 'runs/summary.json', name: 'summary.json', size: SUMMARY_JSON.length, contentType: 'application/json', text: SUMMARY_JSON },
  { key: 'runs/run.log', name: 'run.log', size: RUN_LOG_TEXT.length, contentType: 'text/plain', text: RUN_LOG_TEXT },
  { key: 'runs/model.bin', name: 'model.bin', size: 65536, contentType: 'application/octet-stream' },
]

export function artifactFor(bucket: string, key: string): TutorialArtifact | null {
  if (bucket !== RESULT_BUCKET) return null
  return RESULT_ARTIFACTS.find((artifact) => artifact.key === key) ?? null
}

/** The PNG as bytes; Blob and atob both exist in the browser and in vitest. */
export function plotPngBytes(): Uint8Array {
  const binary = atob(PLOT_PNG_BASE64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function objectHead(bucket: string, key: string): ObjectHead {
  const artifact = artifactFor(bucket, key)
  const input = INPUT_OBJECTS.find((object) => object.key === key)
  return {
    size: artifact?.size ?? input?.size,
    contentType: artifact?.contentType ?? 'text/csv',
    versionId: INPUT_VERSIONS[key],
    metadata: {},
  }
}
