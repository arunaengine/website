import { contextIri, DEFAULT_CRATE_VERSION, specIri } from '@/lib/crate/version'
import { PROCESS_RUN_PROFILE_URI } from '@/lib/profiles/builtinProfiles'

export function snapshotCrate(snapshot: {
  id: string; name: string; contentId: string; contentUrl: string; bytes: number
  author: string; started: string; finished: string
}) {
  const file = { '@id': snapshot.contentId }
  return {
    '@context': [contextIri(DEFAULT_CRATE_VERSION), 'https://w3id.org/ro/terms/workflow-run/context'],
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' }, conformsTo: { '@id': specIri(DEFAULT_CRATE_VERSION) } },
      { '@id': './', '@type': 'Dataset', name: `${snapshot.name} snapshot`, description: 'Notebook cells, embedded attachments, and outputs at capture time.', datePublished: snapshot.finished, conformsTo: { '@id': PROCESS_RUN_PROFILE_URI }, hasPart: [file], mentions: { '@id': `#capture-${snapshot.id}` } },
      { ...file, '@type': 'File', name: `${snapshot.name}.ipynb`, encodingFormat: 'application/x-ipynb+json', contentUrl: snapshot.contentUrl, contentSize: String(snapshot.bytes) },
      { '@id': `#capture-${snapshot.id}`, '@type': 'CreateAction', name: `Capture ${snapshot.name}`, description: 'Captured the notebook state without stopping its kernel.', agent: { '@id': '#author' }, instrument: { '@id': '#portal' }, result: [file], startTime: snapshot.started, endTime: snapshot.finished, actionStatus: { '@id': 'http://schema.org/CompletedActionStatus' } },
      { '@id': '#author', '@type': 'Person', identifier: snapshot.author },
      { '@id': '#portal', '@type': 'SoftwareApplication', name: 'Aruna Portal' },
    ],
  }
}
