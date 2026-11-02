// The line a render tool answers the model with: what the card in front of the
// user already says, so the reply beside it does not say it again.
import { dataEntitiesOf } from '@/lib/dataEntities'
import type { RenderView } from './types'

export const CARD_NOTE_PREFIX = 'Shown to the user as a card'

const MAX_NOTE_CHARS = 600

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

function facts(view: RenderView): string {
  switch (view.kind) {
    case 'table':
      return `table "${view.title}", ${plural(view.rows.length, 'row')} of ${view.columns.join(', ')}`
    case 'chart':
      return `${view.chart} chart "${view.title}" of ${view.series.map((entry) => entry.name).join(', ')} `
        + `over ${plural(view.labels.length, 'label')}`
    case 'stats':
      return `"${view.title}" with ${view.items.map((item) => `${item.label} ${item.value}`).join(', ')}`
    case 'crate':
      return `dataset "${view.title}" with its description and ${plural(dataEntitiesOf(view.crate).length, 'part')}`
    case 'job':
      return [
        `job "${view.title}" in state ${view.state}`,
        view.nodeId ? `on node ${view.nodeId}` : '',
        view.submittedAt || view.startedAt || view.finishedAt ? 'with when it ran' : '',
        view.error ? 'with its error' : '',
        view.outputs.length ? `and ${plural(view.outputs.length, 'output file')}` : '',
      ].filter(Boolean).join(', ')
    case 'object':
      return [
        `object ${view.bucket}/${view.key}`,
        view.size !== undefined ? 'its size' : '',
        view.contentType ? 'type' : '',
        view.versionId ? 'version' : '',
        view.lastModified ? 'last change' : '',
      ].filter(Boolean).join(', ')
    case 'artifact':
      return `the file ${view.artifact.bucket}/${view.artifact.key} itself`
    case 'tree':
      return `listing "${view.title}" with ${plural(view.entries.length, 'entry', 'entries')}`
    case 'timeline':
      return `timeline "${view.title}" with ${plural(view.events.length, 'event')}`
    case 'code':
      return `${view.language} code "${view.title}"`
    case 'diff':
      return `comparison "${view.title}" of ${view.beforeLabel} and ${view.afterLabel}`
  }
}

/** One short line naming what the card shows; the model is told never to repeat it. */
export function cardNote(view: RenderView): string {
  return `${CARD_NOTE_PREFIX}: ${facts(view)}.`.slice(0, MAX_NOTE_CHARS)
}
