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
    summary: 'Every entry in the catalog is an RO-Crate; its purpose decides how it is shown.',
    sections: [
      {
        title: 'One catalog, three purposes',
        paragraphs: [
          'A Dataset is an RO-Crate: a structured description whose graph can cover people, files, software, and related research objects.',
          'Dataset is the default purpose. A root that declares the Profile type is shown as Profile; a crate conforming to the Process Run Crate profile is shown as Process Run. Neither is a separate storage system.',
        ],
      },
      {
        title: 'Description and data are separate',
        paragraphs: [
          'The dataset record is the graph. File bytes live in buckets or external locations; editing or deleting the record never silently touches them.',
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
    summary: 'What a Profile requires, and which validation check is the authoritative one.',
    sections: [
      {
        title: 'Profiles define minimum requirements',
        paragraphs: [
          'A Profile lists the fields and entities expected for a kind of dataset. Extra metadata stays valid unless a closed SHACL constraint forbids it.',
          'A conformsTo reference is a claim, not proof of validation.',
        ],
        image: {
          src: '/docs/v1/profiles.jpg',
          alt: 'Profiles view showing the Process Run Crate profile with its required properties',
          caption: 'Each registered profile shows its required properties, suggested keywords, and downloadable SHACL shapes.',
        },
      },
      {
        title: 'Validation authority',
        bullets: [
          'The editor preview checks drafts early; it advises and never blocks the form.',
          'The node validates the exact saved crate against the exact registered Profile revision before accepting a tagged write.',
          'An unavailable or still-preparing Profile fails closed for tagged writes: retry, or save unprofiled.',
          'External and unregistered Profile references stay readable but cannot be enforced as write tags.',
        ],
      },
      {
        title: 'Changing Profile',
        paragraphs: [
          'Switching a saved dataset to another Profile must pass authoritative validation; unmatched metadata is kept for review, never dropped silently.',
        ],
      },
    ],
  },
  {
    slug: 'data-and-deletion',
    kind: 'Concept',
    title: 'Data, buckets, references, and deletion',
    summary: 'What ordinary delete touches, what permanent purge touches, and what references mean.',
    sections: [
      {
        title: 'Data and dataset references',
        paragraphs: [
          'A dataset references file identities or locations; it never owns the stored bytes. One content identity can have several replicas.',
          'Deletion checks warn about visible references and about removing the last resolvable location. Warnings inform; storage permissions decide.',
        ],
      },
      {
        title: 'Delete markers are recoverable history',
        bullets: [
          'File Delete is a version-less S3 delete: it adds a delete marker and keeps every historical version.',
          'Folder Delete applies the same to the current keys under the prefix, may finish partially, and reports what remains.',
          'Deleting a dataset record removes its graph, never the referenced S3 objects.',
        ],
      },
      {
        title: 'Permanent purge is separate',
        paragraphs: [
          'Permanently delete all versions is an explicit node-side purge with resumable progress. Full bucket deletion also aborts open multipart uploads, settles sync relationships, proves emptiness, then removes the bucket.',
        ],
      },
    ],
  },
  {
    slug: 'realm-nodes-groups',
    kind: 'Concept',
    title: 'Realm, nodes, groups, membership, and replication',
    summary: 'The four scopes behind every badge in the portal.',
    sections: [
      {
        title: 'Scope vocabulary',
        bullets: [
          'Realm: visibility, membership, and realm-wide aggregates.',
          'Node: the REST and S3 authority, and the scope of local storage or placement reports.',
          'Group: ownership, roles, quota, and configured storage behavior.',
          'Membership: connects you to group roles; the node evaluates the resulting permissions on every protected action.',
        ],
        image: {
          src: '/docs/v1/status.jpg',
          alt: 'Status view with realm topology, locations, and the list of realm nodes',
          caption: 'The Status view: the realm, its locations, and every node with role, latency, and connectivity.',
        },
      },
      {
        title: 'Replication is not a unique total',
        paragraphs: [
          'Holder counts include replicas, so summing nodes can exceed the number of unique datasets. A default replication factor is policy, not proof of current copies; a null default can mean all eligible nodes.',
        ],
      },
      {
        title: 'Read scope badges before acting',
        paragraphs: [
          'Realm, node, and group badges name the authority an action uses. Switching one changes the context, not just a display filter.',
        ],
      },
    ],
  },
  {
    slug: 'storage-access',
    kind: 'Concept',
    title: 'Portal sessions, CLI keys, and external backends',
    summary: 'Three S3 mechanisms with different owners, lifetimes, and uses.',
    sections: [
      {
        title: 'Portal S3 session',
        paragraphs: [
          'Browsing uses a short-lived SigV4 session for one selected group: in memory only, at most one hour or the remaining sign-in lifetime, refreshed shortly before expiry.',
          'A session is issued by one node and works only there. Sign-out, account change, or API change clears it.',
        ],
      },
      {
        title: 'CLI and service access key',
        paragraphs: [
          'An optional long-lived key pair for non-portal S3 clients. The secret is shown once, is never stored by the portal, and stays local to the issuing node.',
        ],
      },
      {
        title: 'External storage backend',
        paragraphs: [
          'Group configuration, not a browser credential: an admin registers an S3-compatible endpoint so Aruna routes group data there. Writers inherit the routing but never see the backend secret.',
        ],
      },
    ],
  },
  {
    slug: 'states-and-retry',
    kind: 'Concept',
    title: 'Completion states and retry',
    summary: 'What Accepted, Preparing, Complete, Partial, Unknown, and Unavailable actually promise.',
    sections: [
      {
        title: 'State meanings',
        bullets: [
          'Accepted: durably written, downstream readiness not yet established.',
          'Preparing: a bounded convergence or read retry is in progress.',
          'Complete: the requested scope answered without known omissions.',
          'Partial: some nodes, partitions, or items failed or were not queried.',
          'Unknown: the available state cannot prove absence or completion.',
          'Unavailable: the authority could not answer; distinct from empty or not found.',
        ],
      },
      {
        title: 'Retry without inventing an outcome',
        paragraphs: [
          'Retry rechecks or resumes safely repeatable work. A timed-out read after Accepted does not mean the write failed, and the portal never auto-replays an uncertain mutation because the first attempt may already have committed.',
        ],
      },
    ],
  },
  {
    slug: 'identifiers',
    kind: 'Concept',
    title: 'Automatic w3id PIDs and external identifiers',
    summary: 'The portal-managed primary PID versus descriptive identifier metadata.',
    sections: [
      {
        title: 'One automatic primary w3id',
        paragraphs: [
          'Every persisted dataset gets exactly one conceptual w3id; a Profile uses https://w3id.org/aruna/profile/{id} instead of a duplicate general id.',
          'Minting can continue after the write is accepted, every PID state stays visible, deletion keeps a resolvable tombstone, and owners cannot withdraw the primary PID.',
        ],
      },
      {
        title: 'External identifier is metadata',
        paragraphs: [
          'A DOI, accession, or local code you already have is plain RDF metadata; entering it requests nothing. Extra PID providers appear only when one is configured.',
        ],
      },
      {
        title: 'File identities',
        paragraphs: [
          'Aruna-held bytes get a content-addressed https://w3id.org/aruna/data/{blake3-hex}; contentUrl records a location. Imported external content keeps its source identity.',
        ],
      },
    ],
  },
  {
    slug: 'data-to-compute',
    kind: 'Concept',
    title: 'Data-to-compute and compute-to-data',
    summary: 'How runs are placed, what the verdict means, and how inputs and outputs are named.',
    sections: [
      {
        title: 'How placement is decided',
        paragraphs: [
          'Every node holding a request family plans it independently: one round screens all executor advertisements in the realm and seals its choice only after the last page.',
          'The plan carries a transfer estimate from configured link bandwidths; it is not a measurement of moved bytes.',
        ],
        bullets: [
          'Ranked alternatives: the other acceptable targets, capped at 8 per round.',
          'Rejected candidates: refused targets with a recorded reason, capped at 32.',
          'Omitted: rejections dropped by the cap; non-zero means the record is incomplete.',
          'A plan stays with the node that made it; a node without one reports no placement, which is not "unplanned".',
        ],
      },
      {
        title: 'What the verdict means',
        bullets: [
          'Compute-to-data: every input already had a usable copy on the chosen node; expected transfer zero.',
          'Data-to-compute: at least one input had to move to the chosen node first.',
          'Not placed: the responding node sealed no plan of its own; absence of local evidence only.',
          'The verdict describes the plan, never the measured outcome.',
        ],
      },
      {
        title: 'Input modes',
        bullets: [
          'Snapshot: copied as it was at run start; later writes never affect the run.',
          'Floating: resolved at run time; sees whatever is current, cannot name a version.',
          'Exact: pins one specific version id.',
          'GA4GH tasks carry no mode; the serving node derives one and never pins a version.',
        ],
      },
      {
        title: 'Outputs are exact versions',
        paragraphs: [
          'Each output names the exact version one execution wrote, that execution, and the owning node-local S3 endpoint. Reading the key without the version id answers whatever is current instead.',
          'The owner endpoint can be unknown while version and execution stay exact; the portal says so rather than dropping the output.',
        ],
      },
      {
        title: 'Replicating data ahead of compute',
        paragraphs: [
          'The storage locations view shows which nodes hold a copy. Requesting a copy elsewhere needs WRITE and is accepted as a queued request. A copy on an executor node makes compute-to-data possible; the planner still decides.',
        ],
      },
      {
        title: 'Placement policies and the run-family strategy',
        bullets: [
          'A residency policy is immutable; a reference is its id plus the digest of the definition.',
          'Changing a definition means a new policy id. The planner only routes inputs from compliant copies.',
          'The run-family strategy places the run records themselves; it cannot be removed and is shown read-only.',
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
          'Sign-in lands on the dashboard: realm statistics, node storage, and your groups, live from the node your browser talks to.',
        ],
        image: {
          src: '/docs/v1/dashboard.jpg',
          alt: 'Portal dashboard with realm statistics, storage figures, and group overview',
          caption: 'The dashboard: realm statistics on top, node storage below, your groups at the bottom.',
        },
      },
      {
        title: 'The top bar',
        bullets: [
          'Context switcher: the active realm and group everything you create belongs to.',
          'Search: datasets, data objects, groups, and users in one field; Ctrl+K or Cmd+K focuses it anywhere.',
          'Create dataset: straight into the editor.',
          'Bell, theme toggle, and the account menu with profile, tokens, and sign-out.',
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
          'Dashboard, Data, Datasets, Profiles, and Compute: the everyday views.',
          'Groups, Status, Settings, and Docs: membership, health, and your account.',
          'Admin and Users appear only for realm administrators.',
          'Narrow windows collapse it to an icon rail automatically; the bottom button sets your wide-screen preference.',
        ],
      },
      {
        title: 'On a phone',
        paragraphs: [
          'Below tablet width a bottom bar carries the primary destinations plus a More sheet, and search opens as a full-width panel.',
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
          'Your role in a group decides what you may do with everything it owns. Without a group you can look around but store nothing.',
        ],
      },
      {
        title: 'Create a group',
        steps: [
          'Open Groups and choose Create group.',
          'Name it after the team or project that will own the data.',
          'Create it: you become the admin and can invite members and manage roles.',
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
          'Tabs cover statistics, members, roles, data sources, policies, and storage. The context switcher now carries the group, and new buckets, datasets, and runs are created in its name.',
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
    summary: 'Create a bucket, upload from the browser, recover failed transfers.',
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
          'The browser signs S3 requests with a short-lived session for the selected group; nothing long-lived is stored. See the storage access concept for the full picture.',
        ],
      },
      {
        title: 'Create a bucket and upload',
        steps: [
          'Open Data and confirm the group next to "Showing buckets of".',
          'Type a bucket name under the bucket list and confirm (lowercase, digits, dashes).',
          'Select the bucket, then drag files in or use Add data.',
          'Watch the Transfers panel until every file reports done.',
        ],
        image: {
          src: '/docs/v1/data-browser.jpg',
          alt: 'Data view with the reef-survey-2026 bucket and two uploaded objects',
          caption: 'A bucket with uploaded objects; the toolbar reaches watch, routing, residency, and sync settings.',
        },
      },
      {
        title: 'When an upload fails',
        paragraphs: [
          'A failed transfer stays in the Transfers panel with its error and a Retry link; retrying is always safe.',
        ],
      },
    ],
  },
  {
    slug: 'first-dataset',
    kind: 'Guide',
    title: 'Create your first dataset',
    summary: 'Describe your data, attach files from a bucket, save it with a resolvable identifier.',
    tour: [
      {
        route: '/app',
        anchor: 'top-create-dataset',
        title: 'Create dataset',
        body: 'The top bar opens a fresh, unsaved dataset in the editor.',
      },
      {
        route: '/app/datasets/new',
        anchor: 'editor-add-files',
        title: 'Attach files',
        body: 'Add files references bucket objects in the dataset graph; the bytes stay in the bucket.',
      },
      {
        route: '/app/datasets/new',
        anchor: 'editor-validation',
        title: 'Validation',
        body: 'The node previews validation findings while you edit; findings advise and never block.',
      },
      {
        route: '/app/datasets/new',
        anchor: 'editor-save',
        title: 'Save it',
        body: 'Create dataset makes the write durable and mints the w3id identifier.',
      },
    ],
    sections: [
      {
        title: 'Before you start',
        bullets: [
          'Have a group; the editor shows the owning group under the title.',
          'Upload the files you want to attach first.',
          'New description: Create dataset. Existing RO-Crate archive: Import RO-Crate dataset.',
        ],
      },
      {
        title: 'Describe the dataset',
        steps: [
          'Choose Create dataset in the top bar.',
          'Add a name and a description of what it contains and how it was made.',
          'Pick a license and keywords; both drive discovery.',
          'Optionally pick a registered Profile; preview findings advise, never block.',
        ],
        image: {
          src: '/docs/v1/dataset-editor.jpg',
          alt: 'Dataset editor with name, description, license, and keyword fields filled in',
          caption: 'The editor: entities on the left, fields in the middle, validation at the bottom.',
        },
      },
      {
        title: 'Attach files from a bucket',
        steps: [
          'Choose Add files in the left panel.',
          'Pick From a bucket, select the bucket, tick the objects.',
          'Add the selection; the files become entities of the dataset graph.',
        ],
        image: {
          src: '/docs/v1/dataset-addfiles.jpg',
          alt: 'Add files dialog showing bucket objects with checkboxes',
          caption: 'Attaching bucket objects references them in the graph; the bytes stay in the bucket.',
        },
      },
      {
        title: 'Save and verify',
        steps: [
          'Check the validation footer, then choose Create dataset. On Preparing, wait or Retry; never create a duplicate.',
          'On the detail page check the purpose badge, group, license, and the w3id turning Active.',
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
          'Choose Import RO-Crate dataset and pick the archive.',
          'Review detected version, files, purpose, Profile references, and destination.',
          'Confirm and follow the preparation to Complete or a recoverable Partial.',
        ],
      },
      {
        title: 'Find it again',
        paragraphs: [
          'The Datasets view filters by purpose, profile, and group; quick search reaches the same catalog from anywhere.',
        ],
        image: {
          src: '/docs/v1/datasets-catalog.jpg',
          alt: 'Datasets catalog with search, filters, and the saved dataset card',
          caption: 'The catalog: purpose, profile, and group filters, plus a SPARQL workbench.',
        },
      },
    ],
  },
  {
    slug: 'compute-run',
    kind: 'Guide',
    title: 'Start and follow a compute run',
    summary: 'Run a script next to your data with Quick run and read the states it reports.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-compute',
        title: 'Open Compute',
        body: 'Compute lists the runs you start on this node and the system jobs it produces.',
      },
      {
        route: '/app/compute/quick',
        anchor: 'quickrun-runtime',
        title: 'Pick a runtime',
        body: 'Quick run stages a short Python, JavaScript, or Bash script and builds the container run for you.',
      },
      {
        route: '/app/compute/quick?step=1',
        anchor: 'quickrun-script',
        title: 'Script and data',
        body: 'Write the script here; Add input mounts bucket objects into the container filesystem on the right.',
      },
    ],
    sections: [
      {
        title: 'Choose a starting point',
        paragraphs: [
          'Quick run: a short Python, JavaScript, or Bash script, staged for you. Custom run: your own image, command, and resources. Both run under a group and record provenance identically.',
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
          'Select the owning group.',
          'Write the script, or load a staged one.',
          'Add input mounts bucket objects; the tree shows the filesystem as the script will see it.',
          'Add output declares files worth keeping; stdout and stderr are always captured.',
        ],
        image: {
          src: '/docs/v1/quick-run-script.jpg',
          alt: 'Quick run script step with the editor and the container data tree',
          caption: 'The script step: code left, the container filesystem with staged inputs right.',
        },
      },
      {
        title: 'Review and run',
        steps: [
          'The review shows placement, the container manifest, and the exact request.',
          'Leave the node on Any node unless the run must sit somewhere specific.',
          'Run once: Accepted means durable, Preparing means scheduling is still converging.',
        ],
        image: {
          src: '/docs/v1/quick-run-review.jpg',
          alt: 'Quick run review step with placement, container manifest, and the run request',
          caption: 'Review before launch: the request is shown verbatim.',
        },
      },
      {
        title: 'Follow the run',
        paragraphs: [
          'The run page tracks Queued, Initializing, Running, Finished, and the distributed record underneath: several nodes may plan the same family, and duplicate successes reconcile to one canonical execution.',
          'On completion Aruna writes a Process Run dataset with action, tool, inputs, outputs, status, and group. Open it from the run detail or filter datasets by Process Run.',
        ],
        image: {
          src: '/docs/v1/run-detail.jpg',
          alt: 'Run detail page with lifecycle states and the distributed execution record',
          caption: 'A run in flight: lifecycle on top, the distributed execution record below.',
        },
      },
    ],
  },
  {
    slug: 'storage-backend',
    kind: 'Guide',
    title: 'Configure a storage backend',
    summary: 'Route a group’s uploads to your own S3-compatible storage.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-groups',
        title: 'Open Groups',
        body: 'Backends are group configuration; open the group that should own the routing.',
      },
      {
        route: '/app/groups',
        anchor: 'group-tabs',
        title: 'The Storage tab',
        body: 'The Storage tab of a group registers backends and controls routing.',
      },
    ],
    sections: [
      {
        title: 'Requirements',
        paragraphs: [
          'Group ADMIN role, the endpoint details, and credentials meant for Aruna routing; backend credentials are neither portal sessions nor CLI keys.',
        ],
      },
      {
        title: 'Configure',
        steps: [
          'Open the group and its Storage tab.',
          'Add the endpoint and backend credentials; verify endpoint and certificate first.',
          'Enable the backend and routing only after the connection check succeeds.',
          'Writers inherit the routing but can never reveal or replace the secret.',
        ],
        image: {
          src: '/docs/v1/group-storage.jpg',
          alt: 'Group storage tab with the storage backends section and add backend button',
          caption: 'Backends live on the group: uploads route to your own object storage.',
        },
      },
    ],
  },
  {
    slug: 'cli-access-key',
    kind: 'Guide',
    title: 'Create a CLI or service access key',
    summary: 'A long-lived node-local key for a non-portal S3 client.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-settings',
        title: 'Open Settings',
        body: 'Access keys live in your account settings.',
      },
      {
        route: '/app/settings',
        anchor: 'settings-access',
        title: 'Access & connection',
        body: 'This tab shows your browser session, the API endpoint, and every session issued for your account.',
      },
    ],
    sections: [
      {
        title: 'Use the right credential',
        paragraphs: [
          'The portal itself uses short-lived sessions. Create a key only for a tool that cannot use that flow.',
        ],
      },
      {
        title: 'Create and store safely',
        steps: [
          'Open Settings, then Access & connection.',
          'Confirm issuing node, restrictions, and the intended client.',
          'Copy the access key and one-time secret into the client; the portal never shows the secret again.',
          'Point the client at the issuing node; the key is invalid elsewhere.',
          'Revoke the key when the client no longer needs it.',
        ],
        image: {
          src: '/docs/v1/settings-access.jpg',
          alt: 'Settings access and connection tab with the session, API connection, and sessions list',
          caption: 'Access & connection: the browser session, the API endpoint, and issued sessions.',
        },
      },
    ],
  },
  {
    slug: 'assistant',
    kind: 'Guide',
    title: 'Turn on the assistant',
    summary: 'Wire your own AI provider into the portal and connect an outside MCP client to this node.',
    tour: [
      {
        route: '/app/settings?tab=assistant',
        anchor: 'settings-assistant',
        title: 'The Assistant tab',
        body: 'Providers and MCP clients are configured here; the assistant stays off until a provider is ready.',
      },
      {
        route: '/app/settings?tab=assistant',
        anchor: 'assistant-providers',
        title: 'Providers',
        body: 'API keys stay in this browser tab and are never sent to Aruna; only a ChatGPT sign-in is kept by the node.',
      },
      {
        route: '/app/settings?tab=assistant',
        anchor: 'assistant-mcp',
        title: 'Connect an MCP client',
        body: 'Outside clients reach this node over MCP with a session of their own, listed and revocable under Sessions.',
      },
      {
        route: '/app',
        anchor: 'top-assistant',
        title: 'The assistant button',
        body: 'The top bar carries the assistant once a provider is ready; without one it is not shown.',
      },
    ],
    sections: [
      {
        title: 'Bring your own provider',
        paragraphs: [
          'The in-portal assistant runs on a provider you configure: Claude, OpenAI, an OpenAI-compatible or local endpoint, or a ChatGPT subscription.',
          'API keys stay in this browser tab and are never sent to Aruna; only a ChatGPT sign-in is kept by the node.',
        ],
      },
      {
        title: 'Add a provider',
        steps: [
          'Open Settings, then the Assistant tab.',
          'Choose Add provider.',
          'Sign in to ChatGPT, or paste a key for a local or compatible model endpoint.',
          'Wait for the provider to show Ready.',
        ],
      },
      {
        title: 'Use it everywhere',
        paragraphs: [
          'Once a provider is ready the assistant button appears in the top bar and Assistant joins the sidebar.',
          'Each turn tells the model the route you are on, plus a few facts from the dataset, bucket, and group views. It acts through the tools this node serves over MCP and, while the dataset editor is open, on the draft; writes ask you first, and only you save the draft.',
        ],
      },
      {
        title: 'Connect an MCP client',
        paragraphs: [
          'The client authenticates with a session token of its own, so revoking it never signs you out of the portal.',
        ],
        steps: [
          'Copy the MCP endpoint of this node.',
          'Pick the client, for example Claude Code.',
          'Create a labeled client session and copy the token; it is shown once.',
          'The session is listed and revocable under Sessions.',
        ],
      },
    ],
  },
]

export function docsTopicBySlug(slug: string): DocsTopic | undefined {
  return docsTopics.find((topic) => topic.slug === slug)
}
