// The line a render tool answers the model with: what the card in front of the
// user already says, so the reply beside it does not say it again.
import { formatBytes, formatDate, formatDateTime } from '@/lib/utils'
import { firstLines } from './textLines'
import { datasetCard, inputsText, outputsText, runCard, runSettled, sizeRow, type RunCard } from './crateCard'
import { jobTiming, outputSummary } from './jobLive'
import type { DatasetSummary, RenderView } from './types'
import { quoted } from './untrusted'

export const CARD_NOTE_PREFIX = 'Shown to the user as a card'

const MAX_NOTE_CHARS = 800
const MAX_VALUE_CHARS = 120
const MAX_LIST = 8

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

// Every value from the data is quoted and bounded, so it reads as data and never as prose.
const q = (value: string) => quoted(value, MAX_VALUE_CHARS)

function list(values: string[]): string {
  const shown = values.slice(0, MAX_LIST).map(q).join(', ')
  return values.length > MAX_LIST ? `${shown} and ${values.length - MAX_LIST} more` : shown
}

function runFacts(title: string, run: RunCard): string {
  const settled = runSettled(run)
  return [
    `run record ${q(title)}${run.state ? ` in state ${q(run.state)}` : ''}`,
    settled && run.finishedAt ? `finished ${formatDateTime(run.finishedAt)}` : '',
    !(settled && run.finishedAt) && run.startedAt ? `started ${formatDateTime(run.startedAt)}` : '',
    settled && run.duration ? `took ${run.duration}` : '',
    run.nodeId ? `on node ${q(run.nodeId)}` : '',
    run.tool ? `tool ${q(run.tool)}` : '',
    run.inputFiles
      ? `inputs ${inputsText(run)}${run.inputDatasets.length ? ` (${list(run.inputDatasets.map((source) => source.name))})` : ''}`
      : '',
    run.outputFiles ? `outputs ${outputsText(run)}${run.folder ? ' with their folder' : ''}` : '',
    run.error ? 'its error' : '',
  ].filter(Boolean).join(', ')
}

function datasetFacts(title: string, crate: unknown, summary?: DatasetSummary): string {
  const dataset = datasetCard(crate)
  const size = sizeRow(dataset)
  return [
    `dataset ${q(title)}`,
    summary?.public !== undefined ? (summary.public ? 'public' : 'private') : '',
    dataset.description ? 'its description' : '',
    size ? `${size.label.toLowerCase()} ${size.value}` : '',
    summary?.groupName && summary.groupId ? `owner ${q(summary.groupName)}` : '',
    summary?.updatedAt && formatDate(summary.updatedAt) ? `updated ${formatDate(summary.updatedAt)}` : '',
  ].filter(Boolean).join(', ')
}

function facts(view: RenderView): string {
  switch (view.kind) {
    case 'table':
      return `table ${q(view.title)}, ${plural(view.rows.length, 'row')} of ${list(view.columns)}`
    case 'chart':
      return `${view.chart} chart ${q(view.title)} of ${list(view.series.map((entry) => entry.name))} `
        + `over ${plural(view.labels.length, 'label')}`
    case 'stats':
      return `${q(view.title)}${view.scope ? ` for ${q(view.scope)}` : ''} with `
        + view.items.slice(0, MAX_LIST)
          .map((item) => `${q(item.label)}: ${q(item.value)}${item.hint ? ` (${q(item.hint)})` : ''}`).join(', ')
    case 'crate': {
      const run = runCard(view.crate)
      return run ? runFacts(view.title, run) : datasetFacts(view.title, view.crate, view.summary)
    }
    case 'job': {
      const timing = jobTiming(view)
      return [
        `job ${q(view.title)} in state ${q(view.state)}`,
        timing.when ? `${timing.when.label.toLowerCase()} ${formatDateTime(timing.when.at)}` : '',
        timing.took ? `took ${timing.took}` : '',
        view.nodeId ? `on node ${q(view.nodeId)}` : '',
        view.outputs.length ? `outputs ${outputSummary(view.outputs)}` : '',
        view.attempts !== undefined && view.attempts > 1 ? `${view.attempts} attempts` : '',
        view.error ? 'its error' : '',
      ].filter(Boolean).join(', ')
    }
    case 'object':
      return [
        `object ${q(`${view.bucket}/${view.key}`)}`,
        view.caption ? 'a caption' : '',
        view.size !== undefined ? `size ${formatBytes(view.size)}` : '',
        view.contentType ? `type ${q(view.contentType)}` : '',
        view.lastModified ? 'when it changed' : '',
        view.preview ? `a preview of its ${view.preview.truncated ? 'first lines' : 'whole content'}` : '',
      ].filter(Boolean).join(', ')
    case 'artifact': {
      const text = view.artifact.text
      const shown = text === undefined ? 'itself' : firstLines(text).cut || view.artifact.truncated ? 'with its first lines' : 'with its whole content'
      const size = view.artifact.size !== undefined ? `, size ${formatBytes(view.artifact.size)}` : ''
      return `the file ${q(`${view.artifact.bucket}/${view.artifact.key}`)} ${shown}${view.caption ? ', a caption' : ''}${size}`
    }
    case 'tree':
      return `listing ${q(view.title)} with ${plural(view.entries.length, 'entry', 'entries')}`
    case 'timeline':
      return `timeline ${q(view.title)} with ${plural(view.events.length, 'event')}`
    case 'code':
      return `${q(view.language)} code ${q(view.title)}`
    case 'diff':
      return `comparison ${q(view.title)} of ${q(view.beforeLabel)} and ${q(view.afterLabel)}`
  }
}

/** One short line naming what the card shows; the model is told never to repeat it. */
export function cardNote(view: RenderView): string {
  return `${CARD_NOTE_PREFIX}: ${facts(view)}.`.replace(/\u00a0/g, ' ').slice(0, MAX_NOTE_CHARS)
}
