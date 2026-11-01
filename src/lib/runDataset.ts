import { contextIri, DEFAULT_CRATE_VERSION, specIri } from './crate/version'
import type { RunCrateFileRef, RunCrateModel } from './runCrate'

export interface ResultsDatasetFields {
  name: string
  description: string
  /** A license URL or SPDX id; empty leaves it out. */
  license: string
  published: string
}

// The file entities keep the run record's ids, so the provenance graph joins them.
function fileEntity(file: RunCrateFileRef): Record<string, unknown> {
  return {
    '@id': file.id,
    '@type': 'File',
    name: file.name,
    ...(file.contentSize ? { contentSize: file.contentSize } : {}),
    ...(file.contentUrls?.length ? { contentUrl: file.contentUrls.length === 1 ? file.contentUrls[0] : file.contentUrls } : {}),
  }
}

/**
 * A dataset of a run's results: the outputs are its parts, the inputs what it is based on,
 * and it mentions the run record that says how they were made.
 */
export function resultsDatasetCrate(run: RunCrateModel, recordId: string, fields: ResultsDatasetFields) {
  const ref = (file: RunCrateFileRef) => ({ '@id': file.id })
  const inputs = run.inputs.filter((input) => !run.outputs.some((output) => output.id === input.id))
  return {
    '@context': contextIri(DEFAULT_CRATE_VERSION),
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' }, conformsTo: { '@id': specIri(DEFAULT_CRATE_VERSION) } },
      {
        '@id': './',
        '@type': 'Dataset',
        name: fields.name,
        description: fields.description,
        datePublished: fields.published,
        ...(fields.license ? { license: { '@id': fields.license } } : {}),
        hasPart: run.outputs.map(ref),
        ...(inputs.length ? { isBasedOn: inputs.map(ref) } : {}),
        mentions: { '@id': `https://w3id.org/aruna/${recordId}` },
      },
      ...run.outputs.map(fileEntity),
      ...inputs.map(fileEntity),
    ],
  }
}
