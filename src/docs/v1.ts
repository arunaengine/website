export const docsVersion = 'v1'

export type DocsTopicKind = 'Concept' | 'Guide'

export interface DocsSection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  steps?: string[]
}

export interface DocsTopic {
  slug: string
  kind: DocsTopicKind
  title: string
  summary: string
  sections: DocsSection[]
}

export const docsScreenshots = {
  status: 'deferred' as const,
  note: 'Screenshots and annotated examples are deferred until the matching workflows and non-sensitive fixtures are stable. The v1 guide remains complete and usable as text.',
}

export const docsTopics: DocsTopic[] = [
  {
    slug: 'datasets',
    kind: 'Concept',
    title: 'Datasets and purpose types',
    summary: 'How the Datasets catalog presents every RO-Crate and distinguishes its purpose.',
    sections: [
      {
        title: 'One catalog, three purposes',
        paragraphs: [
          'A Dataset is the portal term for every RO-Crate in the Datasets catalog. An RO-Crate is a structured description whose root identifies the Dataset and whose graph can describe people, files, software, places, and related research objects.',
          'Dataset is the default purpose. Profile and Process Run are specialized purposes, not separate storage systems. A Profile purpose takes precedence when the crate root declares the Profile type. A Process Run is recognized by conformance to the supported Process Run Crate profile. Every other RO-Crate is shown as Dataset.',
        ],
      },
      {
        title: 'Description and data are separate',
        paragraphs: [
          'The Dataset record is the RO-Crate graph. Data files live in buckets or at external locations and are referenced by the graph. Editing or deleting the Dataset record does not silently edit or delete those files.',
        ],
      },
      {
        title: 'Create or import',
        bullets: [
          'Create dataset starts a new portal-authored RO-Crate and lets you choose its owning group and optional Profile.',
          'Import RO-Crate dataset accepts an existing RO-Crate archive, previews it, and registers it as a new Dataset.',
          'These are separate intents. Import does not overwrite an existing Dataset unless an explicit replacement workflow says so.',
        ],
      },
      {
        title: 'RO-Crate version compatibility',
        bullets: [
          'RO-Crate 1.2 and 1.3 are supported for import, validation, and round-trip export.',
          'New portal-authored crates currently emit RO-Crate 1.2. Importing and exporting an existing 1.3 crate preserves its declared version.',
          'RO-Crate 1.1 remains supported for reading.',
        ],
      },
    ],
  },
  {
    slug: 'profiles-conformance',
    kind: 'Concept',
    title: 'Profiles and conformance',
    summary: 'What a Profile requires, what conformance means, and which check is authoritative.',
    sections: [
      {
        title: 'Profiles define minimum requirements',
        paragraphs: [
          'A Profile describes the fields and entities expected for a kind of Dataset. Requirements are minimum requirements by default, so additional metadata remains valid unless an explicit closed SHACL constraint restricts it.',
          'A conformsTo reference states which Profile a Dataset claims to follow. The reference alone is not proof that the Dataset passed validation.',
        ],
      },
      {
        title: 'Validation authority',
        bullets: [
          'The server validation preview in the dataset dialogs checks a draft against the registered Profile before it is saved. It is advisory and never blocks the form.',
          'The backend validates the exact submitted crate against the exact registered Profile revision before accepting a tagged write.',
          'A registered Profile that is unavailable or still preparing fails closed for that tagged write. Retry the check or remove the Profile tag and save an unprofiled Dataset.',
          'External and unregistered Profile references remain readable, but they cannot currently be used as enforceable write tags.',
        ],
      },
      {
        title: 'Changing Profile',
        paragraphs: [
          'Changing a saved Dataset to another Profile is a semantic change. The replacement crate must pass authoritative validation, and unmatched existing metadata remains available for explicit review instead of being discarded silently.',
        ],
      },
    ],
  },
  {
    slug: 'data-and-deletion',
    kind: 'Concept',
    title: 'Data, buckets, references, and deletion',
    summary: 'How Dataset records relate to S3 data and what ordinary delete and permanent purge affect.',
    sections: [
      {
        title: 'Data and Dataset references',
        paragraphs: [
          'Data means buckets and S3 objects or files. A Dataset can reference a file identity or location, but that reference does not make the Dataset record own the stored bytes. One content identity can have several resolvable locations or replicas.',
          'Deletion checks can warn about visible Dataset references, restricted references, and whether the selected operation removes the last resolvable Aruna location. A reference warning informs the decision but does not replace storage permissions or block an otherwise authorized deletion.',
        ],
      },
      {
        title: 'Delete markers are recoverable history',
        bullets: [
          'Ordinary file Delete sends a version-less S3 delete. It creates a delete marker, hides the current head, and preserves historical versions and physical data.',
          'Ordinary folder Delete applies the same delete-marker behavior to the current keys under the exact prefix. It can finish partially and reports keys that remain visible.',
          'Deleting a Dataset record removes its RO-Crate graph. It does not delete referenced S3 objects.',
        ],
      },
      {
        title: 'Permanent purge is separate',
        paragraphs: [
          'Permanently delete all versions is an explicit server-side purge operation. It removes named versions and delete markers and reports partial progress for safe retry. A complete bucket deletion also aborts open multipart uploads, handles sync relationships, proves final emptiness, and then deletes the bucket.',
        ],
      },
    ],
  },
  {
    slug: 'realm-nodes-groups',
    kind: 'Concept',
    title: 'Realm, nodes, groups, membership, and replication',
    summary: 'The scopes that control visibility, authority, ownership, permissions, and copies.',
    sections: [
      {
        title: 'Scope vocabulary',
        bullets: [
          'Realm is the selected visibility, membership, and realm-aggregate scope.',
          'Node is the REST and S3 authority and the scope for local storage or placement reports.',
          'Group is the ownership, role, and quota scope for Datasets, data, and configured storage behavior.',
          'Membership connects a person to group roles. The backend evaluates the resulting permission paths for every protected action.',
        ],
      },
      {
        title: 'Replication is not a unique total',
        paragraphs: [
          'Replication records which nodes currently hold or are responsible for copies. Node holder counts include replicas, so adding them together can exceed the number of unique Datasets. A default replication factor is placement policy, not proof that every record currently has that many copies. A null default can mean all eligible nodes.',
        ],
      },
      {
        title: 'Read scope badges before acting',
        paragraphs: [
          'Realm, node, and group badges identify the authority and data set an action uses. Switching a Realm, node, or group changes that context rather than merely changing a display filter.',
        ],
      },
    ],
  },
  {
    slug: 'storage-access',
    kind: 'Concept',
    title: 'Portal sessions, CLI keys, and external backends',
    summary: 'Three separate S3 mechanisms with different owners, lifetimes, and uses.',
    sections: [
      {
        title: 'Portal S3 session',
        paragraphs: [
          'Routine portal access uses a short-lived SigV4 session derived from the signed-in identity for one explicitly selected group. It stays in memory, lasts no more than one hour or the remaining sign-in lifetime, and refreshes five minutes before expiry while active.',
          'A portal session is issued by one node and works only on that node. Switching node is explicit and obtains a session from the selected node. Sign-out, account change, or API change clears the in-memory sessions.',
        ],
      },
      {
        title: 'CLI and service access key',
        paragraphs: [
          'A CLI or service key is an optional long-lived access-key and secret pair for non-portal S3 clients. Its secret is shown once, is never stored or activated by the portal, and remains local to the node that issued it.',
        ],
      },
      {
        title: 'External storage backend',
        paragraphs: [
          'An external backend is group configuration, not a browser credential. A group administrator registers an S3-compatible endpoint and write-only backend credentials so Aruna can route group bucket data there. Ordinary writers use the configured behavior but cannot view backend secrets or change routing.',
        ],
      },
    ],
  },
  {
    slug: 'states-and-retry',
    kind: 'Concept',
    title: 'Completion states and retry',
    summary: 'How the portal distinguishes durable acceptance, convergence, completeness, uncertainty, and outages.',
    sections: [
      {
        title: 'State meanings',
        bullets: [
          'Accepted means a write is durably accepted, but downstream projection or read readiness is not yet established.',
          'Preparing means a bounded convergence or read retry is in progress.',
          'Complete means the requested scope answered without known omissions.',
          'Partial means some nodes, partitions, or items failed or were not queried.',
          'Unknown means the available API, cache, or permission state cannot prove absence or completion.',
          'Unavailable means the authority or check could not currently answer. It is distinct from empty or not found.',
        ],
      },
      {
        title: 'Retry without inventing an outcome',
        paragraphs: [
          'Retry rechecks or resumes a safely repeatable operation. A timed-out read after Accepted does not mean creation failed. A partial query keeps its missing coverage visible. The portal does not automatically replay an uncertain mutating request because the first request may already have committed.',
        ],
      },
    ],
  },
  {
    slug: 'identifiers',
    kind: 'Concept',
    title: 'Automatic w3id PIDs and external identifiers',
    summary: 'The difference between the portal-managed primary PID and descriptive identifier metadata.',
    sections: [
      {
        title: 'One automatic primary w3id',
        paragraphs: [
          'Every persisted Dataset receives exactly one automatic conceptual w3id. Ordinary Datasets and Process Runs use the general Dataset identity. A Profile uses https://w3id.org/aruna/profile/{id} as its sole primary PID instead of receiving a duplicate general Dataset w3id.',
          'Minting can continue after the Dataset write is accepted. Requested, processing, active, failed, tombstoned, and unavailable states remain visible and retryable where appropriate. Normal Dataset deletion keeps a resolvable tombstone. Ordinary Dataset owners cannot withdraw the primary PID.',
        ],
      },
      {
        title: 'External identifier is metadata',
        paragraphs: [
          'External identifier is an ordinary RDF metadata field for a DOI, accession, local code, or other identifier that already exists. Entering it does not request a new PID. Additional PID providers appear only when a real provider is configured.',
        ],
      },
      {
        title: 'File identities',
        paragraphs: [
          'For Aruna-held content, a content-addressed https://w3id.org/aruna/data/{blake3-hex} identifies the bytes independently of a bucket location. contentUrl records a physical or download location. Imported external content keeps its source identity when Aruna does not hold the bytes.',
        ],
      },
    ],
  },
  {
    slug: 'data-to-compute',
    kind: 'Concept',
    title: 'Data-to-compute and compute-to-data',
    summary: 'How a run is placed, what the placement verdict means, and how inputs and outputs are named.',
    sections: [
      {
        title: 'How placement is decided',
        paragraphs: [
          'Every node that holds a request family plans it independently. One planning round screens every executor advertisement the realm publishes, walking members in node order and their backends by executor kind. Selection is sealed only after the last page, so a lower-ranked target seen early is never launched while a better one waits in a later page.',
          'The plan carries a transfer estimate: the bytes the planner expected to move to the chosen executor. It is a plan-time estimate computed from configured link bandwidths, not a measurement of what was actually transferred.',
        ],
        bullets: [
          'Ranked alternatives are the other acceptable targets, capped at 8 per round.',
          'Rejected candidates are targets the round refused, with a reason recorded, capped at 32 explanations.',
          'Omitted counts the rejections that cap dropped. A non-zero value means the recorded rejections are incomplete, not that the remaining targets agreed.',
          'A plan is kept by the node that made it. A job answered by another node can report no placement at all, which is not the same as an unplanned run.',
        ],
      },
      {
        title: 'What the verdict means',
        bullets: [
          'Compute-to-data means the estimate was zero: every input already had a usable copy on the node chosen to run the work, so the plan expected to move no bytes.',
          'Data-to-compute means at least one input had no usable copy there, so the plan expected to move those bytes to the chosen node before the run.',
          'Not placed means the responding node sealed no plan of its own. It is an absence of local evidence, not a statement that no plan exists.',
          'The verdict describes the plan, not the outcome. It does not prove how many bytes actually moved.',
        ],
      },
      {
        title: 'Input modes',
        bullets: [
          'A snapshot input is copied as it was at submission. The run is unaffected by later writes to that key.',
          'A floating reference resolves the key at run time, so the run sees whatever is current then. It cannot name a version.',
          'An exact reference pins one specific version and requires that version id.',
          'The GA4GH task interface carries no mode of its own. A task submitted through it takes the mode the serving node derives from its own deployment, and never pins a version.',
        ],
      },
      {
        title: 'Outputs are exact versions',
        paragraphs: [
          'Each output names the exact version that one execution wrote, the execution that wrote it, and the node-local S3 endpoint that owns that version. Reading the same key without the version id answers whatever is current instead, which a duplicate execution, a later upload, or a copy from another node can all change.',
          'The owner endpoint can be unknown while the version and the owning execution stay exact. The portal says so rather than dropping the output; retry, or ask a node that holds that advertisement.',
        ],
      },
      {
        title: 'Replicating data ahead of compute',
        paragraphs: [
          'The storage locations view of a file reports which nodes hold a copy, which have one on the way, and which could not answer. Asking another node for a copy needs WRITE on the file and is accepted as a queued request, not as a stored copy.',
          'Placing a copy on a node that advertises a compute backend is what makes a compute-to-data plan possible. It does not force one: the planner still screens every advertisement and seals its own decision.',
        ],
      },
      {
        title: 'Placement policies and the job-family strategy',
        bullets: [
          'A residency policy is an immutable published definition. A reference to one is the pair of its id and the digest of that definition, because an id alone could be answered with other bytes.',
          'Publishing a changed definition requires a new policy id. Policies restrict which nodes a copy may live on, and the planner only routes inputs from copies that comply.',
          'The job-family strategy places the replicated job records themselves. It cannot be removed and its shard count is frozen, so it is shown read-only.',
        ],
      },
    ],
  },
  {
    slug: 'first-dataset',
    kind: 'Guide',
    title: 'Create your first Dataset',
    summary: 'Create a new Dataset or import an existing RO-Crate with an explicit group and purpose.',
    sections: [
      {
        title: 'Before you start',
        bullets: [
          'Sign in and confirm the selected Realm.',
          'Choose the owning group explicitly. Group membership and roles determine whether the write is allowed.',
          'Use Create dataset for a new description. Use Import RO-Crate dataset for an existing RO-Crate archive.',
        ],
      },
      {
        title: 'Create',
        steps: [
          'Open Datasets and choose Create dataset.',
          'Select the owning group, then add a title, description, and other useful metadata.',
          'Optionally choose a registered Profile. Treat the server validation preview findings as advisory and resolve violations before submission.',
          'Submit the Dataset. Accepted confirms the durable write. If the detail view says Preparing, wait or use Retry instead of creating a duplicate.',
          'Review the Dataset purpose badge, group scope, conformance status, and automatic w3id status on the detail page.',
        ],
      },
      {
        title: 'Import',
        steps: [
          'Choose Import RO-Crate dataset and select a supported RO-Crate archive.',
          'Review the detected version, file count, purpose, Profile references, and destination before submitting.',
          'Confirm the new Dataset and follow any preparation job until it is Complete or reports a recoverable Partial state.',
        ],
      },
    ],
  },
  {
    slug: 'storage-backend',
    kind: 'Guide',
    title: 'Configure a storage backend',
    summary: 'Register an external S3-compatible backend for one group without confusing it with portal access.',
    sections: [
      {
        title: 'Requirements',
        paragraphs: [
          'You need the group ADMIN role, the endpoint details, and credentials intended for Aruna routing. Backend credentials are not portal-session or CLI credentials.',
        ],
      },
      {
        title: 'Configure',
        steps: [
          'Open Groups, select the owning group, and find Storage backends.',
          'Add the S3-compatible endpoint and backend credentials. Verify the endpoint and certificate information before saving.',
          'Enable the backend and choose routing only after the connection check succeeds.',
          'Confirm the group and node scope before creating or moving data. Ordinary group writers inherit the routing but cannot reveal or replace the backend secret.',
        ],
      },
    ],
  },
  {
    slug: 'cli-access-key',
    kind: 'Guide',
    title: 'Create a CLI or service access key',
    summary: 'Issue an optional long-lived node-local key for a non-portal S3 client.',
    sections: [
      {
        title: 'Use the right credential',
        paragraphs: [
          'The portal itself uses short-lived sessions. Create a CLI or service key only for a command-line tool or service that cannot use the portal session flow.',
        ],
      },
      {
        title: 'Create and store safely',
        steps: [
          'Open Settings and the CLI and service access section.',
          'Confirm the issuing node, group or permission restrictions, and intended client before creating the key.',
          'Copy the access key and one-time secret into the client or its secret store. The portal does not retain the secret for later display.',
          'Configure the client with the issuing node endpoint. The key is not valid on another node.',
          'Revoke the key when the client no longer needs it. Revocation does not affect short-lived portal sessions.',
        ],
      },
    ],
  },
  {
    slug: 'compute-run',
    kind: 'Guide',
    title: 'Submit and follow a compute run',
    summary: 'Choose a group and inputs, submit work, and read its run and provenance states.',
    sections: [
      {
        title: 'Submit',
        steps: [
          'Open Compute and choose the quick or structured submission flow available on the connected node.',
          'Select the owning group. The aruna-engine.org/group label carries that accounting and provenance context.',
          'Choose readable inputs, an output destination, the container or executable details, and resource values accepted by the backend.',
          'Review the group, node, storage, command, and resource scope before submitting.',
          'Submit once. Accepted means the request is durable, while Preparing means scheduling or materialization is still converging.',
        ],
      },
      {
        title: 'Follow results',
        paragraphs: [
          'The run view reports task or job progress without treating an unavailable node as an empty result. When the run completes, Aruna writes a Process Run Dataset that records the action, tool, inputs, outputs, status, and owning group. Open that Process Run from the run detail or filter Datasets by Process Run.',
        ],
      },
    ],
  },
]

export function docsTopicBySlug(slug: string): DocsTopic | undefined {
  return docsTopics.find((topic) => topic.slug === slug)
}
