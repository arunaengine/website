export const docsVersion = 'v1'

export type DocsTopicKind = 'Concept' | 'Guide'

export interface DocsImage {
  src: string
  alt: string
  caption?: string
}

export interface DocsSection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
  steps?: string[]
  image?: DocsImage
}

/** One stop of a guided tour: a real portal route and a real `data-tour` anchor. */
export interface DocsTourStep {
  route: string
  anchor: string
  title: string
  body: string
}

export interface DocsTopic {
  slug: string
  kind: DocsTopicKind
  title: string
  summary: string
  sections: DocsSection[]
  tour?: DocsTourStep[]
}

export const docsScreenshots = {
  status: 'available' as const,
  note: 'Screenshots come from a live portal walkthrough at desktop width. Highlighted frames mark the control the surrounding text refers to.',
}

export const docsTopics: DocsTopic[] = [
  {
    slug: 'datasets',
    kind: 'Concept',
    title: 'Datasets and purpose types',
    summary: 'How the datasets catalog presents every RO-Crate and distinguishes its purpose.',
    sections: [
      {
        title: 'One catalog, three purposes',
        paragraphs: [
          'A Dataset is the portal term for every RO-Crate in the datasets catalog. An RO-Crate is a structured description whose root identifies the dataset and whose graph can describe people, files, software, places, and related research objects.',
          'Dataset is the default purpose. Profile and Process Run are specialized purposes, not separate storage systems. A Profile purpose takes precedence when the RO-Crate root declares the Profile type. A Process Run is recognized by conformance to the supported Process Run Crate profile. Every other RO-Crate is shown as dataset.',
        ],
      },
      {
        title: 'Description and data are separate',
        paragraphs: [
          'The dataset record is the RO-Crate graph. Data files live in buckets or at external locations and are referenced by the graph. Editing or deleting the dataset record does not silently edit or delete those files.',
        ],
      },
      {
        title: 'Create or import',
        bullets: [
          'Create dataset starts a new portal-authored RO-Crate and lets you choose its owning group and optional Profile.',
          'Import RO-Crate dataset accepts an existing RO-Crate archive, previews it, and registers it as a new dataset.',
          'These are separate intents. Import does not overwrite an existing dataset unless an explicit replacement workflow says so.',
        ],
      },
      {
        title: 'RO-Crate version compatibility',
        bullets: [
          'RO-Crate 1.2 and 1.3 are supported for import, validation, and round-trip export.',
          'New portal-authored datasets currently emit RO-Crate 1.2. Importing and exporting an existing 1.3 archive preserves its declared version.',
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
          'A Profile describes the fields and entities expected for a kind of dataset. Requirements are minimum requirements by default, so additional metadata remains valid unless an explicit closed SHACL constraint restricts it.',
          'A conformsTo reference states which Profile a dataset claims to follow. The reference alone is not proof that the dataset passed validation.',
        ],
        image: {
          src: '/docs/v1/profiles.jpg',
          alt: 'Profiles view showing the Process Run Crate profile with its required properties',
          caption: 'The Profiles view lists every registered profile with its required properties, suggested keywords, and downloadable SHACL shapes.',
        },
      },
      {
        title: 'Validation authority',
        bullets: [
          'The node validation preview in the dataset dialogs checks a draft against the registered Profile before it is saved. It is advisory and never blocks the form.',
          'The node validates the exact saved RO-Crate against the exact registered Profile revision before accepting a tagged write.',
          'A registered Profile that is unavailable or still preparing fails closed for that tagged write. Retry the check or remove the Profile tag and save an unprofiled dataset.',
          'External and unregistered Profile references remain readable, but they cannot currently be used as enforceable write tags.',
        ],
      },
      {
        title: 'Changing Profile',
        paragraphs: [
          'Changing a saved dataset to another Profile is a semantic change. The replacement dataset must pass authoritative validation, and unmatched existing metadata remains available for explicit review instead of being discarded silently.',
        ],
      },
    ],
  },
  {
    slug: 'data-and-deletion',
    kind: 'Concept',
    title: 'Data, buckets, references, and deletion',
    summary: 'How dataset records relate to S3 data and what ordinary delete and permanent purge affect.',
    sections: [
      {
        title: 'Data and dataset references',
        paragraphs: [
          'Data means buckets and S3 objects or files. A Dataset can reference a file identity or location, but that reference does not make the dataset record own the stored bytes. One content identity can have several resolvable locations or replicas.',
          'Deletion checks can warn about visible dataset references, restricted references, and whether the selected operation removes the last resolvable Aruna location. A reference warning informs the decision but does not replace storage permissions or block an otherwise authorized deletion.',
        ],
      },
      {
        title: 'Delete markers are recoverable history',
        bullets: [
          'Ordinary file Delete sends a version-less S3 delete. It creates a delete marker, hides the current head, and preserves historical versions and physical data.',
          'Ordinary folder Delete applies the same delete-marker behavior to the current keys under the exact prefix. It can finish partially and reports keys that remain visible.',
          'Deleting a dataset record removes its RO-Crate graph. It does not delete referenced S3 objects.',
        ],
      },
      {
        title: 'Permanent purge is separate',
        paragraphs: [
          'Permanently delete all versions is an explicit node-side purge operation. It removes named versions and delete markers and reports partial progress for safe retry. A complete bucket deletion also aborts open multipart uploads, handles sync relationships, proves final emptiness, and then deletes the bucket.',
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
          'Group is the ownership, role, and quota scope for datasets, data, and configured storage behavior.',
          'Membership connects a user to group roles. The node evaluates the resulting permission paths for every protected action.',
        ],
        image: {
          src: '/docs/v1/status.jpg',
          alt: 'Status view with realm topology, locations, and the list of realm nodes',
          caption: 'The Status view shows the realm, its locations, and every node with its role, latency, and connectivity.',
        },
      },
      {
        title: 'Replication is not a unique total',
        paragraphs: [
          'Replication records which nodes currently hold or are responsible for copies. Node holder counts include replicas, so adding them together can exceed the number of unique datasets. A default replication factor is placement policy, not proof that every record currently has that many copies. A null default can mean all eligible nodes.',
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
          'Every persisted dataset receives exactly one automatic conceptual w3id. Ordinary datasets and Process Runs use the general dataset identity. A Profile uses https://w3id.org/aruna/profile/{id} as its sole primary PID instead of receiving a duplicate general dataset w3id.',
          'Minting can continue after the dataset write is accepted. Requested, processing, active, failed, administratively withdrawn, tombstoned, and unknown states remain visible. Normal dataset deletion keeps a resolvable tombstone. Ordinary dataset owners cannot withdraw the primary PID.',
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
          'A plan is kept by the node that made it. A run answered by another node can report no placement at all, which is not the same as an unplanned run.',
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
          'A snapshot input is copied as it was when the run started. The run is unaffected by later writes to that key.',
          'A floating reference resolves the key at run time, so the run sees whatever is current then. It cannot name a version.',
          'An exact reference pins one specific version and requires that version id.',
          'The GA4GH task interface carries no mode of its own. A run started through it takes the mode the serving node derives from its own deployment, and never pins a version.',
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
        title: 'Placement policies and the run-family strategy',
        bullets: [
          'A residency policy is an immutable published definition. A reference to one is the pair of its id and the digest of that definition, because an id alone could be answered with other bytes.',
          'Publishing a changed definition requires a new policy id. Policies restrict which nodes a copy may live on, and the planner only routes inputs from copies that comply.',
          'The run-family strategy places the replicated run records themselves. It cannot be removed and its shard count is frozen, so it is shown read-only.',
        ],
      },
    ],
  },
  {
    slug: 'portal-tour',
    kind: 'Guide',
    title: 'Find your way around',
    summary: 'The dashboard, the top bar, the sidebar, and search: where everything lives.',
    tour: [
      {
        route: '/app',
        anchor: 'top-search',
        title: 'Search',
        body: 'The search field reaches datasets, data objects, groups, and users in one place.',
      },
      {
        route: '/app',
        anchor: 'top-create-dataset',
        title: 'Create dataset',
        body: 'Create dataset jumps straight into the dataset editor.',
      },
      {
        route: '/app',
        anchor: 'context-switcher',
        title: 'Active context',
        body: 'The context switcher shows the active realm and group, and everything you create belongs to that context.',
      },
      {
        route: '/app',
        anchor: 'nav-groups',
        title: 'The sidebar',
        body: 'Groups, Status, Settings, and Docs manage membership, health, and your account.',
      },
      {
        route: '/app',
        anchor: 'top-account',
        title: 'Your account',
        body: 'The account menu leads to your profile, access tokens, and sign-out.',
      },
    ],
    sections: [
      {
        title: 'Start at the dashboard',
        paragraphs: [
          'After sign-in the portal opens on the dashboard. It summarizes the selected realm: how many datasets, profiles, and groups it holds, how many nodes are online, and what this node stores. The cards update live from the node your browser is connected to.',
        ],
        image: {
          src: '/docs/v1/dashboard.jpg',
          alt: 'Portal dashboard with realm statistics, storage figures, and group overview',
          caption: 'The dashboard: realm statistics on top, node storage figures below, your groups at the bottom.',
        },
      },
      {
        title: 'The top bar',
        bullets: [
          'The context switcher on the left shows the active realm and, once you belong to one, the active group. Everything you create belongs to that context.',
          'The search field reaches datasets, data objects, groups, and users in one place. Press Ctrl+K (Cmd+K on macOS) to focus it from anywhere.',
          'Create dataset jumps straight into the dataset editor.',
          'The bell collects notifications, the sun and moon button switches the theme, and the account menu on the right leads to your profile, access tokens, and sign-out.',
        ],
        image: {
          src: '/docs/v1/quick-search.jpg',
          alt: 'Quick search open in the top bar with dataset and object results for the query reef',
          caption: 'Quick search groups results by kind and links to the full search page.',
        },
      },
      {
        title: 'The sidebar',
        bullets: [
          'Dashboard, Data, Datasets, Profiles, and Compute are the everyday working views.',
          'Groups, Status, Settings, and Docs manage membership, health, and your account.',
          'Admin and Users appear only for realm administrators.',
          'On narrow windows the sidebar collapses to an icon rail by itself; the collapse button at the bottom sets your preference on wide screens.',
        ],
      },
      {
        title: 'On a phone',
        paragraphs: [
          'Below tablet width the sidebar gives way to a bottom bar with the primary destinations and a More sheet for the rest. Search opens as a full-width panel from the magnifier button.',
        ],
      },
    ],
  },
  {
    slug: 'first-group',
    kind: 'Guide',
    title: 'Create your group',
    summary: 'Groups own datasets, data, and runs; create one before you upload anything.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-groups',
        title: 'Open Groups',
        body: 'Every dataset, bucket, and compute run belongs to a group, so this is the first step after sign-in.',
      },
      {
        route: '/app/groups',
        anchor: 'groups-create',
        title: 'Create a group',
        body: 'Name the group after the team or project that will own the data; you become its admin.',
      },
      {
        route: '/app/groups',
        anchor: 'group-tabs',
        title: 'Inside a group',
        body: 'A group page carries tabs for live statistics, members, roles, data sources, policies, and storage.',
      },
    ],
    sections: [
      {
        title: 'Groups own your work',
        paragraphs: [
          'Every dataset, bucket, and compute run belongs to a group, and your role in that group decides what you may do with it. A fresh account without a group can look around but cannot store anything yet, so this is the first step after sign-in.',
        ],
      },
      {
        title: 'Create a group',
        steps: [
          'Open Groups in the sidebar and choose Create group.',
          'Name the group after the team or project that will own the data.',
          'Create it. You become the group admin and can invite members and manage roles.',
        ],
        image: {
          src: '/docs/v1/group-create.jpg',
          alt: 'Create group dialog with the group name field',
          caption: 'One name is all a group needs to start.',
        },
      },
      {
        title: 'Inside a group',
        paragraphs: [
          'The group page carries tabs for live statistics, members, roles, data sources, policies, and storage. The context switcher in the top bar now shows the group, and new buckets, datasets, and runs are created in its name.',
        ],
        image: {
          src: '/docs/v1/group-detail.jpg',
          alt: 'Group detail page with stats, members, roles, data sources, policies, and storage tabs',
          caption: 'The group page: role badge next to the name, management tabs below.',
        },
      },
    ],
  },
  {
    slug: 'upload-data',
    kind: 'Guide',
    title: 'Upload and browse data',
    summary: 'Create a bucket, upload files from the browser, and know what to do when a transfer fails.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-data',
        title: 'Open Data',
        body: 'The Data view browses buckets through the node’s S3 interface, signed in your browser.',
      },
      {
        route: '/app/buckets',
        anchor: 'bucket-create',
        title: 'Create a bucket',
        body: 'Type a bucket name under the bucket list and confirm; bucket names are lowercase, digits, and dashes.',
      },
      {
        route: '/app/buckets',
        anchor: 'bucket-add-data',
        title: 'Add your files',
        body: 'Select the bucket, then drag files onto the drop zone or use Add data.',
      },
    ],
    sections: [
      {
        title: 'Sessions, not stored keys',
        paragraphs: [
          'The Data view browses buckets through the node’s S3 interface, signed in your browser. The portal mints a short-lived session for the selected group and keeps it in memory only; no long-lived credential is stored. See the storage access concept for how sessions, CLI keys, and backends differ.',
        ],
      },
      {
        title: 'Create a bucket and upload',
        steps: [
          'Open Data and confirm the group shown next to “Showing buckets of”.',
          'Type a bucket name in the field under the bucket list and confirm. Bucket names are S3 names: lowercase, digits, and dashes.',
          'Select the bucket, then drag files onto the drop zone or use Add data.',
          'Watch the Transfers panel in the corner until every file reports done.',
        ],
        image: {
          src: '/docs/v1/data-browser.jpg',
          alt: 'Data view with the reef-survey-2026 bucket and two uploaded objects',
          caption: 'A bucket with uploaded objects. The toolbar reaches watch, routing, residency, and sync settings for the bucket.',
        },
      },
      {
        title: 'When an upload fails',
        paragraphs: [
          'A failed transfer stays in the Transfers panel with its error and a Retry link, and retrying is safe. Uploads that race each other can fail with a transient conflict; retry simply sends the file again.',
        ],
      },
    ],
  },
  {
    slug: 'first-dataset',
    kind: 'Guide',
    title: 'Create your first dataset',
    summary: 'Describe your data as an RO-Crate, attach files from a bucket, and save it with a resolvable identifier.',
    sections: [
      {
        title: 'Before you start',
        bullets: [
          'Sign in, confirm the realm, and have a group; the dataset is created in the group the editor shows under the title.',
          'Upload the files you want to attach first, so they are ready to pick from a bucket.',
          'Use Create dataset for a new description. Use Import RO-Crate dataset for an existing RO-Crate archive.',
        ],
      },
      {
        title: 'Describe the dataset',
        steps: [
          'Choose Create dataset in the top bar. The editor opens with a fresh, unsaved dataset.',
          'Give it a name and a description that says what it contains and how it was made.',
          'Pick a license and add keywords; both make the dataset far easier to find and reuse.',
          'Optionally choose a registered Profile. The node validation preview marks findings as advisory and never blocks the form.',
        ],
        image: {
          src: '/docs/v1/dataset-editor.jpg',
          alt: 'Dataset editor with name, description, license, and keyword fields filled in',
          caption: 'The editor: entities on the left, fields in the middle, validation at the bottom of the page.',
        },
      },
      {
        title: 'Attach files from a bucket',
        steps: [
          'Choose Add files in the left panel.',
          'Pick From a bucket, select the bucket, and tick the objects that belong to this dataset. Upload to a bucket and Another dataset are the alternatives.',
          'Add the selection and close the dialog. The files appear as entities of the dataset graph.',
        ],
        image: {
          src: '/docs/v1/dataset-addfiles.jpg',
          alt: 'Add files dialog showing bucket objects with checkboxes',
          caption: 'Attaching bucket objects references them in the RO-Crate graph; the bytes stay in the bucket.',
        },
      },
      {
        title: 'Save and verify',
        steps: [
          'Check the validation footer, then choose Create dataset. Accepted confirms the durable write; if the detail view says Preparing, wait or use Retry instead of creating a duplicate.',
          'On the detail page review the purpose badge, group scope, license, and the automatic w3id persistent identifier as it becomes Active.',
        ],
        image: {
          src: '/docs/v1/dataset-detail.jpg',
          alt: 'Saved dataset detail page with metadata cards and the persistent identifier',
          caption: 'A saved dataset: metadata up top, the resolvable w3id identifier below.',
        },
      },
      {
        title: 'Import an existing RO-Crate',
        steps: [
          'Choose Import RO-Crate dataset and select a supported RO-Crate archive.',
          'Review the detected version, file count, purpose, Profile references, and destination before you import.',
          'Confirm the new dataset and follow the preparation until it is Complete or reports a recoverable Partial state.',
        ],
      },
      {
        title: 'Find it again',
        paragraphs: [
          'The Datasets view lists every visible RO-Crate with purpose, profile, and group filters, and quick search in the top bar reaches the same catalog from anywhere.',
        ],
        image: {
          src: '/docs/v1/datasets-catalog.jpg',
          alt: 'Datasets catalog with search, filters, and the saved dataset card',
          caption: 'The catalog: filters by purpose, profile, and group, plus a SPARQL workbench for advanced queries.',
        },
      },
    ],
  },
  {
    slug: 'compute-run',
    kind: 'Guide',
    title: 'Start and follow a compute run',
    summary: 'Run a script next to your data with Quick run, and read the run states it reports.',
    sections: [
      {
        title: 'Choose a starting point',
        paragraphs: [
          'Compute offers two entry points. Quick run takes a short Python, JavaScript, or Bash script, stages it for you, and builds the container run. Custom run takes your own container image, command, and resources. Both run under a group and record their provenance the same way.',
        ],
        image: {
          src: '/docs/v1/compute-new-run.jpg',
          alt: 'Compute view with the New run menu showing Quick run and Custom run',
          caption: 'New run: a quick script or a fully described container.',
        },
      },
      {
        title: 'Script and data',
        steps: [
          'Pick the runtime; the working directory defaults to /work.',
          'Select the owning group. The run and its provenance carry that group.',
          'Write the script in the editor, or load an existing staged script.',
          'Use Add input to mount bucket objects into the container; the tree on the right shows the filesystem exactly as the script will see it.',
          'Declare outputs with Add output if the run writes files worth keeping; stdout and stderr are always captured.',
        ],
        image: {
          src: '/docs/v1/quick-run-script.jpg',
          alt: 'Quick run script step with the editor and the container data tree',
          caption: 'The script step: code on the left, the container filesystem with staged inputs on the right.',
        },
      },
      {
        title: 'Review and run',
        steps: [
          'The review step shows the placement choice, what goes into the container, and the exact run request that will be submitted.',
          'Leave the node on Any node unless the run must sit on specific hardware or next to specific data.',
          'Run it once. Accepted means the request is durable, while Preparing means scheduling or materialization is still converging.',
        ],
        image: {
          src: '/docs/v1/quick-run-review.jpg',
          alt: 'Quick run review step with placement, container manifest, and the run request',
          caption: 'Review before launch: the request is shown verbatim, including the staged script and inputs.',
        },
      },
      {
        title: 'Follow the run',
        paragraphs: [
          'The run page tracks the lifecycle from Queued through Initializing and Running to Finished, and shows the distributed execution record underneath: several nodes may plan the same request family independently, and duplicate successes are reconciled to one canonical execution.',
          'The run view reports progress without treating an unreachable node as an empty result. When the run completes, Aruna writes a Process Run dataset that records the action, tool, inputs, outputs, status, and owning group. Open it from the run detail or filter datasets by Process Run.',
        ],
        image: {
          src: '/docs/v1/run-detail.jpg',
          alt: 'Run detail page with lifecycle states and the distributed execution record',
          caption: 'A run in flight: lifecycle on top, the distributed execution record with its eventually consistent view below.',
        },
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
          'Open Groups, select the owning group, and open the Storage tab.',
          'Add the S3-compatible endpoint and backend credentials. Verify the endpoint and certificate information before saving.',
          'Enable the backend and choose routing only after the connection check succeeds.',
          'Confirm the group and node scope before creating or moving data. Ordinary group writers inherit the routing but cannot reveal or replace the backend secret.',
        ],
        image: {
          src: '/docs/v1/group-storage.jpg',
          alt: 'Group storage tab with the storage backends section and add backend button',
          caption: 'Storage backends live on the group: uploads route to your own object storage instead of the node.',
        },
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
          'Open Settings, then Access & connection.',
          'Confirm the issuing node, group or permission restrictions, and intended client before creating the key.',
          'Copy the access key and one-time secret into the client or its secret store. The portal does not retain the secret for later display.',
          'Configure the client with the issuing node endpoint. The key is not valid on another node.',
          'Revoke the key when the client no longer needs it. Revocation does not affect short-lived portal sessions.',
        ],
        image: {
          src: '/docs/v1/settings-access.jpg',
          alt: 'Settings access and connection tab with the session, API connection, and sessions list',
          caption: 'Access & connection: the browser session, the API endpoint, and every session issued for your account.',
        },
      },
    ],
  },
]

export function docsTopicBySlug(slug: string): DocsTopic | undefined {
  return docsTopics.find((topic) => topic.slug === slug)
}
