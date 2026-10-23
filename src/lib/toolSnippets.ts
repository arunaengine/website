// The lines a person pastes into aws, rclone, Python, an AI assistant or
// Nextflow to reach the data on this computer. The address is the one the node
// reported; with none there is no address to print, so a placeholder stands in
// and nothing here ever guesses a port.
import { mcpSnippet } from '@/lib/assistant/mcpSnippets'

export const KEY_ID_PLACEHOLDER = 'YOUR_KEY_ID'
export const SECRET_PLACEHOLDER = 'YOUR_SECRET'
const ADDRESS_PLACEHOLDER = 'ADDRESS_OF_THIS_COMPUTER'

export type ToolId = 'aws' | 'rclone' | 'python' | 'assistant'

export interface ToolKey {
  accessKeyId: string
  secret: string
}

export const TOOLS: ReadonlyArray<{ id: ToolId; label: string; text: string }> = [
  { id: 'aws', label: 'AWS CLI', text: 'Works with the normal aws command. Nothing else to install.' },
  {
    id: 'rclone',
    label: 'rclone',
    text: 'Good for copying large folders. Add this remote once, then use it like any other.',
  },
  { id: 'python', label: 'Python', text: 'For scripts and notebooks. Uses the common boto3 package.' },
  {
    id: 'assistant',
    label: 'AI assistant',
    text: 'Lets an AI assistant such as Claude Desktop or Cursor read your data. Paste this into its settings.',
  },
]

/** The origin of the node's own API, which also serves the job and AI routes. */
export function nodeOrigin(apiBase: string | null | undefined): string | null {
  if (!apiBase) return null
  try {
    return new URL(apiBase).origin
  } catch {
    return null
  }
}

/** Where workflow tools send jobs: the TES facade of this computer's node. */
export function tesAddress(apiBase: string | null | undefined): string | null {
  const origin = nodeOrigin(apiBase)
  return origin ? `${origin}/ga4gh/tes/v1` : null
}

export function toolSnippet(tool: ToolId, address: string | null, key: ToolKey | null, assistant?: string | null): string {
  const where = address ?? ADDRESS_PLACEHOLDER
  const id = key?.accessKeyId ?? KEY_ID_PLACEHOLDER
  const secret = key?.secret ?? SECRET_PLACEHOLDER
  switch (tool) {
    case 'aws':
      return [
        '# Save the key once',
        `aws configure set aws_access_key_id ${id} --profile aruna-local`,
        `aws configure set aws_secret_access_key ${secret} --profile aruna-local`,
        '',
        '# List your buckets',
        `aws s3 ls --profile aruna-local --endpoint-url ${where}`,
      ].join('\n')
    case 'rclone':
      return [
        '# Add this to ~/.config/rclone/rclone.conf',
        '[aruna-local]',
        'type = s3',
        'provider = Other',
        `access_key_id = ${id}`,
        `secret_access_key = ${secret}`,
        `endpoint = ${where}`,
        '',
        '# Then copy a folder into a bucket',
        'rclone copy "My folder" aruna-local:my-bucket',
      ].join('\n')
    case 'python':
      return [
        'import boto3',
        '',
        's3 = boto3.client(',
        '    "s3",',
        `    endpoint_url="${where}",`,
        `    aws_access_key_id="${id}",`,
        `    aws_secret_access_key="${secret}",`,
        ')',
        'for bucket in s3.list_buckets()["Buckets"]:',
        '    print(bucket["Name"])',
      ].join('\n')
    case 'assistant':
      return mcpSnippet(assistant ?? `${ADDRESS_PLACEHOLDER}/mcp`, '', 'generic').code
  }
}

export function nextflowSnippet(tes: string | null): string {
  return ['# nextflow.config', "process.executor = 'tes'", `tes.endpoint = '${tes ?? ADDRESS_PLACEHOLDER}'`].join('\n')
}
