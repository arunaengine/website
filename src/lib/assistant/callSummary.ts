// One plain line saying what a tool call does, built from the tool name and
// the input fields worth naming, e.g. `Creating dataset "Water quality 2024"`.

const VERBS: Record<string, string> = {
  add: 'Adding',
  apply: 'Applying',
  cancel: 'Cancelling',
  capture: 'Capturing',
  copy: 'Copying',
  create: 'Creating',
  delete: 'Deleting',
  edit: 'Editing',
  import: 'Importing',
  move: 'Moving',
  remove: 'Removing',
  rename: 'Renaming',
  replace: 'Replacing',
  run: 'Running',
  set: 'Setting',
  submit: 'Submitting',
  undo: 'Undoing',
  update: 'Updating',
  upload: 'Uploading',
  write: 'Writing',
}

/** The fields worth naming, most telling first. A name or title is quoted. */
const LABELS = ['name', 'title', 'path', 'key', 'id', 'document_id', 'job_id', 'field']
const QUOTED = new Set(['name', 'title'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

/** Picks the label field, looking one level into a nested object like `spec`. */
function label(fields: Record<string, unknown>): { key: string; value: string } | null {
  for (const key of LABELS) {
    const value = text(fields[key])
    if (value) return { key, value }
  }
  for (const nested of Object.values(fields)) {
    for (const key of ['name', 'title']) {
      const value = text(record(nested)[key])
      if (value) return { key, value }
    }
  }
  return null
}

/** True when the tool name reads as an action that changes something. */
export function isWriteAction(name: string): boolean {
  return Object.hasOwn(VERBS, name.split('_')[0])
}

/** The one-line summary; the tool name itself when the action is unknown. */
export function callSummary(name: string, input: unknown): string {
  if (!isWriteAction(name)) return name
  const parts = name.split('_')
  const verb = VERBS[parts[0]]
  const subject = parts.slice(1).join(' ')
  const fields = record(input)
  const picked = label(fields)
  const detail = picked
    ? ` ${QUOTED.has(picked.key) ? `"${picked.value}"` : picked.value}`
    : ''
  const bucket = text(fields.bucket)
  const removing = verb === 'Deleting' || verb === 'Removing'
  const where = bucket ? ` ${removing ? 'from' : 'in'} bucket ${bucket}` : ''
  return `${verb}${subject ? ` ${subject}` : ''}${detail}${where}`
}
