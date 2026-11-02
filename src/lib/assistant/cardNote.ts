// The line a render tool answers the model with: what the card in front of the
// user already says, so the reply beside it does not say it again.
import { formatBytes, formatDate, formatDateTime } from '@/lib/utils'
import { firstLines } from './textLines'
import { datasetCard, inputsText, outputsText, runCard, runSettled, sizeRow, type RunCard } from './crateCard'
import { jobTiming, outputSummary } from './jobLive'
import type { DatasetSummary, RenderView } from './types'

export const CARD_NOTE_PREFIX = 'Shown to the user as a card'

const MAX_NOTE_CHARS = 800

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

function runFacts(title: string, run: RunCard): string {
  const settled = runSettled(run)
  return [
    `run record "${title}"${run.state ? ` in state ${run.state}` : ''}`,
    settled && run.finishedAt ? `finished ${formatDateTime(run.finishedAt)}` : '',
    !(settled && run.finishedAt) && run.startedAt ? `started ${formatDateTime(run.startedAt)}` : '',
    settled && run.duration ? `took ${run.duration}` : '',
    run.nodeId ? `on node ${run.nodeId}` : '',
    run.tool ? `tool ${run.tool}` : '',
    run.inputFiles
      ? `inputs ${inputsText(run)}${run.inputDatasets.length ? ` (${run.inputDatasets.map((source) => source.name).join(', ')})` : ''}`
      : '',
    run.outputFiles ? `outputs ${outputsText(run)}${run.folder ? ' with their folder' : ''}` : '',
    run.error ? 'its error' : '',
  ].filter(Boolean).join(', ')
}

function datasetFacts(title: string, crate: unknown, summary?: DatasetSummary): string {
  const dataset = datasetCard(crate)
  const size = sizeRow(dataset)
  return [
    `dataset "${title}"`,
    summary?.public !== undefined ? (summary.public ? 'public' : 'private') : '',
    dataset.description ? 'its description' : '',
    size ? `${size.label.toLowerCase()} ${size.value}` : '',
    summary?.groupName && summary.groupId ? `owner ${summary.groupName}` : '',
    summary?.updatedAt && formatDate(summary.updatedAt) ? `updated ${formatDate(summary.updatedAt)}` : '',
  ].filter(Boolean).join(', ')
}

function facts(view: RenderView): string {
  switch (view.kind) {
    case 'table':
      return `table "${view.title}", ${plural(view.rows.length, 'row')} of ${view.columns.join(', ')}`
    case 'chart':
      return `${view.chart} chart "${view.title}" of ${view.series.map((entry) => entry.name).join(', ')} `
        + `over ${plural(view.labels.length, 'label')}`
    case 'stats':
      return `"${view.title}"${view.scope ? ` for ${view.scope}` : ''} with `
        + view.items.map((item) => `${item.label} ${item.value}${item.hint ? ` (${item.hint})` : ''}`).join(', ')
    case 'crate': {
      const run = runCard(view.crate)
      return run ? runFacts(view.title, run) : datasetFacts(view.title, view.crate, view.summary)
    }
    case 'job': {
      const timing = jobTiming(view)
      return [
        `job "${view.title}" in state ${view.state}`,
        timing.when ? `${timing.when.label.toLowerCase()} ${formatDateTime(timing.when.at)}` : '',
        timing.took ? `took ${timing.took}` : '',
        view.nodeId ? `on node ${view.nodeId}` : '',
        view.outputs.length ? `outputs ${outputSummary(view.outputs)}` : '',
        view.attempts !== undefined && view.attempts > 1 ? `${view.attempts} attempts` : '',
        view.error ? 'its error' : '',
      ].filter(Boolean).join(', ')
    }
    case 'object':
      return [
        `object ${view.bucket}/${view.key}`,
        view.caption ? 'a caption' : '',
        view.size !== undefined ? `size ${formatBytes(view.size)}` : '',
        view.contentType ? `type ${view.contentType}` : '',
        view.lastModified ? 'when it changed' : '',
        view.preview ? `a preview of its ${view.preview.truncated ? 'first lines' : 'whole content'}` : '',
      ].filter(Boolean).join(', ')
    case 'artifact': {
      const text = view.artifact.text
      const shown = text === undefined ? 'itself' : firstLines(text).cut || view.artifact.truncated ? 'with its first lines' : 'with its whole content'
      const size = view.artifact.size !== undefined ? `, size ${formatBytes(view.artifact.size)}` : ''
      return `the file ${view.artifact.bucket}/${view.artifact.key} ${shown}${view.caption ? ', a caption' : ''}${size}`
    }
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
  return `${CARD_NOTE_PREFIX}: ${facts(view)}.`.replace(/\u00a0/g, ' ').slice(0, MAX_NOTE_CHARS)
}
