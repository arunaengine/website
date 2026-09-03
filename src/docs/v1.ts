import { glossaryTopic } from './glossary'

export const docsVersion = 'v1'

export type DocsTopicKind = 'Concept' | 'Guide'

/** Figures drawn inline by a component, so they take the page theme. */
export type DocsFigure = 'where-data-lives'

/** A screenshot file under /docs/v1, or a named inline figure. */
export type DocsImage = { alt: string; caption?: string } & (
  | { src: string; figure?: never }
  | { figure: DocsFigure; src?: never }
)

export interface DocsSection {
  title: string
  /** Lucide icon name rendered beside the heading; DocsView maps it. */
  icon?: string
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
  /** Hands "Show me in the portal" to the interactive tutorial of that name. */
  tutorial?: 'compute' | 'profile'
}

/** Stable anchor id for a section heading; concept: links may target it. */
export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const docsScreenshots = {
  status: 'available' as const,
  note: 'Screenshots come from a live portal walkthrough at desktop width. Highlighted frames mark the control the surrounding text refers to.',
}

// Copy in paragraphs, bullets, and steps may carry [label](target) links;
// src/docs/inline.ts defines the concept:, page:, api:, and https:// targets.
// Guides come first: they are the way in. Concepts below them form the wiki.
export const docsTopics: DocsTopic[] = [
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
        icon: 'LayoutDashboard',
        paragraphs: [
          'Sign-in lands on the [dashboard](page:dashboard): your own statistics first, aggregated over the [groups](concept:realm-nodes-groups#groups-own-your-work) you belong to, with the per-group breakdown right below them, then [realm](concept:realm-nodes-groups#nodes-and-the-realm) statistics, live from the [node](concept:glossary#node) your browser talks to.',
          'The "Lead with" switch in the section header decides which of the two comes first, and it follows your account to every browser. Figures for the node you are connected to live on the [Status](page:status) page.',
        ],
        image: {
          src: '/docs/v1/dashboard.jpg',
          alt: 'Portal dashboard with personal statistics, per-group storage, and realm statistics',
          caption: 'The dashboard: your statistics and your groups on top, realm statistics below.',
        },
      },
      {
        title: 'The top bar',
        icon: 'Search',
        bullets: [
          'Context switcher: the active [realm](concept:realm-nodes-groups#nodes-and-the-realm) and [group](concept:realm-nodes-groups#groups-own-your-work) everything you create belongs to.',
          'Search: [datasets](concept:datasets), data [objects](concept:glossary#object), groups, and users in one field; Ctrl+K or Cmd+K focuses it anywhere.',
          '[Create dataset](page:dataset-new): straight into the editor.',
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
        icon: 'PanelLeft',
        bullets: [
          'Dashboard, [Data](page:buckets), [Datasets](page:datasets), [Profiles](page:profiles), and [Compute](page:compute): the everyday views.',
          '[Groups](page:groups), [Status](page:status), [Settings](page:settings), and Docs: membership, health, and your account.',
          'Admin and Users appear only for realm administrators.',
          'Narrow windows collapse the sidebar to an icon rail automatically; the bottom button sets your wide-screen preference.',
        ],
      },
      {
        title: 'On a phone',
        icon: 'Smartphone',
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
        icon: 'Users',
        paragraphs: [
          'Every [dataset](concept:datasets), [bucket](concept:data-and-deletion#buckets-hold-the-bytes), and [compute run](concept:glossary#compute-run) belongs to a [group](concept:realm-nodes-groups#groups-own-your-work), and your [role](concept:glossary#role) in the group decides what you may do with everything it owns. Without a group you can look around but store nothing.',
        ],
      },
      {
        title: 'Create a group',
        icon: 'CirclePlus',
        steps: [
          'Open [Groups](page:groups) and choose Create group.',
          'Name it after the team or project that will own the data.',
          'Create it. You become the admin and can invite [members](concept:glossary#membership) and manage [roles](concept:glossary#role).',
        ],
        image: {
          src: '/docs/v1/group-create.jpg',
          alt: 'Create group dialog with the group name field',
          caption: 'One name is all a group needs to start.',
        },
      },
      {
        title: 'Inside a group',
        icon: 'Settings',
        paragraphs: [
          'Tabs cover statistics, members, [roles](concept:glossary#role), data sources, policies, and [storage](concept:storage-access#external-storage-backend). The context switcher now carries the group, and new [buckets](concept:data-and-deletion#buckets-hold-the-bytes), [datasets](concept:datasets), and runs are created in its name.',
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
        body: 'Type a bucket name under the bucket list and confirm. A name needs 3 to 63 characters: lowercase letters, digits, dots and dashes, starting and ending with a letter or digit.',
      },
      {
        route: '/app/buckets',
        anchor: 'bucket-add-data',
        title: 'Add your files',
        body: 'Select the bucket, then drag files onto the drop zone or use Add data.',
      },
      {
        route: '/app/buckets',
        anchor: 'bucket-settings',
        title: 'Bucket storage',
        body: 'Storage opens one page per bucket: which backend takes new uploads, which placement policies apply, and which syncs exist.',
      },
    ],
    sections: [
      {
        title: 'Sessions, not stored keys',
        icon: 'KeyRound',
        paragraphs: [
          'The browser signs S3 requests with a short-lived [session](concept:storage-access#portal-s3-session) for the selected [group](concept:realm-nodes-groups#groups-own-your-work); nothing long-lived is stored. The [sessions and keys](concept:storage-access) concept has the full picture.',
        ],
      },
      {
        title: 'Create a bucket and upload',
        icon: 'Upload',
        steps: [
          'Open [Data](page:buckets) and confirm the group next to "Showing buckets of".',
          'Type a [bucket](concept:data-and-deletion#buckets-hold-the-bytes) name under the bucket list and confirm. A name needs 3 to 63 characters: lowercase letters, digits, dots and dashes, starting and ending with a letter or digit.',
          'Select the bucket, then drag files in or use Add data.',
          'Watch the Transfers panel until every file reports done.',
        ],
        image: {
          src: '/docs/v1/data-browser.jpg',
          alt: 'Data view with the reef-survey-2026 bucket and two uploaded objects',
          caption: 'A bucket with uploaded objects; the toolbar reaches Watch and Storage.',
        },
      },
      {
        title: 'Bucket names',
        icon: 'ListChecks',
        paragraphs: [
          'The node checks a name before anything is created, and the portal repeats the same check while you type. A refused name is answered with the rule it breaks.',
          'Folder names and object keys have rules of their own: no slash in a folder name, no empty or dot-only segment in a key, and at most 1024 bytes.',
        ],
        bullets: [
          'Bucket names must contain at least 3 characters.',
          'Bucket names must contain at most 63 characters.',
          'Bucket names may only contain lowercase letters, digits, dots and dashes.',
          'Bucket names must start and end with a letter or a digit.',
          'Bucket names must not contain two dots in a row.',
          'Bucket names must not look like an IP address.',
          'Bucket names must not start with xn--.',
        ],
      },
      {
        title: 'When an upload fails',
        icon: 'RefreshCw',
        paragraphs: [
          'A failed transfer stays in the Transfers panel with its error and a Retry link. [Retrying](concept:states-and-retry#retry-without-inventing-an-outcome) is always safe.',
        ],
      },
    ],
  },
  {
    slug: 'where-data-lives',
    kind: 'Concept',
    title: 'Where your data lives',
    summary: 'Storage backends, placement policies, copies and bucket syncs: what puts data somewhere, and what only allows it.',
    sections: [
      {
        title: 'Overview',
        icon: 'Server',
        paragraphs: [
          'A bucket is a name on one node. An upload lands on a storage backend behind that node, and what comes out is a copy: one stored piece of data a node can serve.',
          'A placement policy is a rule about where a copy may exist. It allows a write or refuses it, and never adds, moves or removes anything by itself. Copies come from uploads, from bucket syncs, from an explicit copy request, and from staging a compute input.',
          'Every figure the portal shows about copies is one node\'s view, answered by the node you asked.',
        ],
        image: {
          figure: 'where-data-lives',
          alt: 'An upload passes a storage backend and becomes a copy while a placement policy allows or refuses it; separately a sync writes a second bucket on another node',
          caption: 'A storage backend takes the write, a placement policy only allows it, and a sync is the one thing that creates a second bucket.',
        },
      },
      {
        title: 'Buckets',
        icon: 'Boxes',
        paragraphs: [
          'The S3 name of an [object](concept:glossary#object), its bucket and key on one node, is served by that node alone. The same bucket name on another node is a different bucket with its own contents and its own permissions.',
          'The data underneath is content addressed, so other [realm](concept:realm-nodes-groups#nodes-and-the-realm) nodes can hold verified copies of it. Losing a node loses its names, not the data, as long as a copy exists somewhere else.',
          'A bucket belongs to a group, and the group decides who may read and write it. Everything on this page is configured per bucket or per group, never per file, except the rules a single file can carry.',
        ],
      },
      {
        title: 'Storage backend',
        icon: 'HardDrive',
        paragraphs: [
          'The storage backend is the physical store behind one node: the node operator\'s own store, or an S3, GCS or Azure account your group registered. Which backend takes an upload is decided per write, by the node that accepts it.',
          'Naming a backend is binding: an upload that cannot reach it fails instead of quietly landing somewhere else. Naming a storage class is only a preference: a node without that class stores the upload itself.',
        ],
        bullets: [
          'A rule for one exact key wins first.',
          'Then the rule with the longest matching key prefix.',
          'Then the bucket rule with an empty prefix.',
          'Then the group default under the group Storage tab.',
          'Then the node operator\'s own rules, and last the node default backend.',
        ],
      },
      {
        title: 'Placement policies',
        icon: 'ShieldCheck',
        paragraphs: [
          'A placement policy lists where copies may be stored: a node, a location, a node label, an executor kind. Anything the policy does not list is excluded. There is no rule for forbidding a place, for preferring one, or for demanding a number of copies.',
          'A policy is immutable and identified by the digest of its definition. Publishing a change creates a new policy id, and buckets keep the old one until they are attached again.',
          'Several policies on one bucket combine by intersection: a copy has to be allowed by all of them. A copy also inherits the rules of the version it came from and never drops them, so the set only ever tightens.',
          'Attaching a policy governs the objects written afterwards. "Apply to existing files" attaches the same rules to the objects that were already there; it attaches rules and copies nothing.',
          'A realm admin publishes realm-wide policies. A group admin publishes policies owned by their group and attaches them to that group\'s buckets. A group-owned policy is refused on another group\'s bucket.',
          'The coverage figures count objects that carry the rules on the node you asked. That is not proof that every copy of them sits in an allowed place.',
        ],
      },
      {
        title: 'Storage locations',
        icon: 'MapPin',
        paragraphs: [
          'Storage locations answers where the copies of one version are right now, as far as the node you asked could find out.',
        ],
        bullets: [
          'Present: that node confirmed it holds a copy it can serve.',
          'Pending: a copy is queued for that node and is not there yet.',
          'Unreachable: the node did not answer, so nothing is known about it.',
          'Denied: the node keeps the bucket under rules you do not pass, so it would not say.',
          'Not stored: the version holds no data anywhere. It marks a deletion, or it points at data held elsewhere.',
        ],
        steps: [
          'Open a file in [Data](page:buckets) and choose Storage in its row; the Storage tab lists the copies of the selected version.',
          'Read the state per node, and the note that says why a list may be incomplete.',
          'Use "Add a copy" to ask a named node to fetch that exact version. It needs write permission and is answered as queued, not as stored.',
        ],
      },
      {
        title: 'Syncs',
        icon: 'ArrowLeftRight',
        paragraphs: [
          'A bucket sync is a standing, one way mapping from a source bucket on this node into a bucket on a target node. The target checks its own write permission, writes its own copy, and owns and serves it from then on under its own name.',
          'Only the syncs you created are listed to you, and only you can run, pause or delete them. A bucket can be synced by somebody else without ever appearing in your list.',
          'A sync is not a placement policy. A sync creates a second, independently owned bucket; a policy is a rule about where copies of this bucket may live. The copies a sync writes do show up in Storage locations, under the bucket and key the target uses.',
        ],
        bullets: [
          'Once: copies everything under the source now, and can be run again later.',
          'Keep in sync: copies what is there, then follows every new version automatically.',
          'Reference: the target gets records that point back at the source instead of the data.',
          'Source references decide what happens when a source object itself points at data elsewhere: fetch the data and send it, send the pointer unchanged, or leave those objects out.',
          'Replicate deletions: a delete on the source only reaches the target when this is switched on.',
        ],
      },
      {
        title: 'Versions and deletion',
        icon: 'History',
        paragraphs: [
          'Every write makes a new version, and a plain delete leaves a marker with the history behind it. [Versions and deletion](concept:data-and-deletion) explains what each action removes and what stays recoverable.',
          'Deleting a sync relationship removes no data on either side: the target keeps what it already wrote. Deleting a bucket is a separate, permanent action on one node.',
          'A placement policy never deletes anything either. A copy that stops matching its rules is held back on the node that has it until an admin revalidates or releases it.',
        ],
      },
      {
        title: 'Examples',
        icon: 'Lightbulb',
        bullets: [
          'A second copy at a partner institute: publish a policy that allows both institutes and attach it to the bucket, then add a copy on the partner node or set up a sync. The policy alone creates nothing.',
          'A mirror the partner owns: create a bucket sync in "Keep in sync" mode to their node. They serve their bucket under their own name and keep it if the sync is deleted.',
          'Storage your group pays for: register a backend on the group Storage tab, set it as the default storage backend there, and override it per prefix with a bucket rule.',
          'Compute next to the data: a run goes to a node that already holds the inputs, so an extra copy on an executor node makes that possible. See [data to compute](concept:data-to-compute).',
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
        body: 'Add files records bucket objects as parts of the dataset; the bytes stay in the bucket.',
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
        icon: 'ListChecks',
        bullets: [
          'Have a [group](concept:realm-nodes-groups#groups-own-your-work); the editor shows the owning group under the title.',
          'Upload the files you want to attach first; the [upload guide](concept:upload-data) shows how.',
          'New description: Create dataset. Existing [RO-Crate](concept:datasets#the-bundle-is-an-ro-crate) archive: Import RO-Crate dataset.',
        ],
      },
      {
        title: 'Describe the dataset',
        icon: 'PencilLine',
        steps: [
          'Choose [Create dataset](page:dataset-new) in the top bar.',
          'Add a name and a description of what it contains and how it was made.',
          'Pick a license and keywords; both drive discovery.',
          'Optionally pick a [Profile](concept:profiles-conformance), public or from the dataset\'s group; preview findings advise, never block.',
        ],
        image: {
          src: '/docs/v1/dataset-editor.jpg',
          alt: 'Dataset editor with name, description, license, and keyword fields filled in',
          caption: 'The editor: entities on the left, fields in the middle, validation at the bottom.',
        },
      },
      {
        title: 'Attach files from a bucket',
        icon: 'Files',
        steps: [
          'Choose Add files in the left panel, or Add files on the Has part row of any dataset or folder.',
          'Pick From a bucket, select the [bucket](concept:data-and-deletion#buckets-hold-the-bytes), tick the [objects](concept:glossary#object).',
          'Add the selection; the files become entities of the dataset [graph](concept:glossary#graph) and appear on the Has part row.',
          'The same dialog uploads new objects, links another dataset, reuses something already here, or records an external URL.',
          'Has part is an ordinary row: its menu unlinks an entry, and unlinking the last link to a file offers to remove the file as well. A file the dataset cannot reach is flagged, because the node refuses it.',
        ],
        image: {
          src: '/docs/v1/dataset-addfiles.jpg',
          alt: 'Add files dialog showing bucket objects with checkboxes',
          caption: 'Attaching bucket objects references them in the graph; the bytes stay in the bucket.',
        },
      },
      {
        title: 'Save and verify',
        icon: 'BadgeCheck',
        steps: [
          'Check the validation footer, then choose Create dataset. On [Preparing](concept:states-and-retry), wait or Retry; never create a duplicate.',
          'On the detail page check the [purpose](concept:datasets#one-catalog-three-purposes) badge, group, license, and the [w3id](concept:identifiers) turning Active.',
        ],
        image: {
          src: '/docs/v1/dataset-detail.jpg',
          alt: 'Saved dataset detail page with metadata cards and the persistent identifier',
          caption: 'A saved dataset: metadata up top, the resolvable w3id identifier below.',
        },
      },
      {
        title: 'Import an existing RO-Crate',
        icon: 'Import',
        steps: [
          'Choose Import RO-Crate dataset and pick the archive.',
          'Review detected version, files, [purpose](concept:datasets#one-catalog-three-purposes), [Profile](concept:profiles-conformance) references, and destination.',
          'Confirm and follow the preparation to a [Complete or a recoverable Partial](concept:states-and-retry) state.',
        ],
      },
      {
        title: 'Find it again',
        icon: 'Search',
        paragraphs: [
          'The [Datasets](page:datasets) view filters by [purpose](concept:datasets#one-catalog-three-purposes), profile, and group; quick search reaches the same catalog from anywhere.',
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
    slug: 'build-a-profile',
    kind: 'Guide',
    title: 'Build a profile',
    summary: 'Write the checklist other datasets of your kind should meet, and know what the node enforces.',
    tutorial: 'profile',
    sections: [
      {
        title: 'The root dataset shape',
        icon: 'Package',
        paragraphs: [
          'A profile is itself a [dataset](concept:datasets), stored under profiles/, that describes what other datasets should carry.',
          'Its Root dataset shape holds the rules for the dataset itself: name, description, license, and whatever else your kind of data needs. Every RO-Crate has exactly one root, so this shape is bound to it when the node validates.',
        ],
      },
      {
        title: 'Properties and obligations',
        icon: 'ListChecks',
        bullets: [
          'Required: validation fails when the value is missing.',
          'Recommended: validation warns, and the write still succeeds.',
          'Optional: the field is offered and never complained about.',
          'A rule names a property term, a value kind, and, for lists, how many entries are allowed.',
        ],
      },
      {
        title: 'Entity shapes and references',
        icon: 'Waypoints',
        paragraphs: [
          'A rule whose value is an entity (a Person, an Organization, a File) points at that type. The rules for that type live in one shared shape, so every rule pointing at a Person gets the same Person rules.',
          'A shape that no rule points at produces no field in the dataset form. It is not inert, though: its SHACL shape targets the class, so any Person a dataset does describe is still checked against it.',
        ],
      },
      {
        title: 'Visibility and registration',
        icon: 'Globe',
        paragraphs: [
          'A public profile is registered: it gets a permanent https://w3id.org/aruna/profile/ address, its files are published so any tool can fetch them, and datasets may declare it.',
          'A group-only profile is stored and editable, and only the datasets of its own group may declare it. Other groups do not see it. Make it public when everyone should be able to use it.',
          'A public profile may go back to group only. Datasets of other groups that declare it turn stale, and their next tagged write is refused until the tag is removed or the profile is public again.',
        ],
      },
      {
        title: 'Generated files and what the node enforces',
        icon: 'Braces',
        bullets: [
          'profile.html: the human-readable specification of the rules.',
          'mode.json: the form structure, compatible with Describo and Crate-O.',
          'schema.json: the value rules the portal checks while you type.',
          'shapes.ttl: the SHACL shapes the [node](concept:realm-nodes-groups) validates a tagged write against, and the only one with the final word.',
        ],
      },
      {
        title: 'Importing SHACL',
        icon: 'Import',
        paragraphs: [
          'An existing profile RO-Crate, a mode file, or a SHACL file can be imported: everything the builder can express becomes editable rules, and the original file travels on inside shapes.ttl.',
          'What has no form equivalent is listed beside the rules, so the parts of the file without a field are visible rather than silently dropped.',
        ],
      },
      {
        title: 'Using it on a dataset',
        icon: 'CircleCheck',
        paragraphs: [
          'A [dataset](concept:datasets) declares a profile in its editor. Choosing one adds a row for every property the profile requires, and an entity for every reference it asks for, so the form states the checklist instead of hiding it.',
          'The check beside the form runs the draft exactly as a save would, without saving anything. A refusal names every missing property with the entity it belongs to, and saving runs that same check once more before the write.',
          'The interactive tutorial above walks the whole loop on a practice profile: authoring it, applying it, being refused, and correcting the draft until the node accepts it.',
        ],
      },
    ],
  },
  {
    slug: 'compute-run',
    kind: 'Guide',
    title: 'Start and follow a compute run',
    summary: 'Run a script next to your data with Quick run and read the states it reports.',
    tutorial: 'compute',
    sections: [
      {
        title: 'Choose a starting point',
        icon: 'Play',
        paragraphs: [
          'Quick run stages a short Python, JavaScript, or Bash script for you. Custom run takes your own image, command, and resources. Both run under a [group](concept:realm-nodes-groups#groups-own-your-work) and record provenance identically.',
        ],
        image: {
          src: '/docs/v1/compute-new-run.jpg',
          alt: 'Compute view with the New run menu showing Quick run and Custom run',
          caption: 'New run: a quick script or a fully described container.',
        },
      },
      {
        title: 'Script and data',
        icon: 'SquareTerminal',
        paragraphs: [
          'A run creates no bucket of its own. It reads each input from the bucket that holds it, at the version current when the run was accepted, and writes every output into the bucket and key the run names.',
        ],
        steps: [
          'Pick the runtime; the working directory defaults to /work.',
          'Select the owning group.',
          'Write the script, or load a staged one.',
          'Add input mounts [bucket](concept:data-and-deletion#buckets-hold-the-bytes) [objects](concept:glossary#object); the tree shows the filesystem as the script will see it.',
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
        icon: 'Rocket',
        steps: [
          'Read the review: [placement](concept:data-to-compute), the container manifest, and the exact request.',
          'Leave the node on Any node unless the run must sit on a specific [node](concept:glossary#node).',
          'Run once. [Accepted](concept:states-and-retry) means durable; Preparing means scheduling is still converging.',
        ],
        image: {
          src: '/docs/v1/quick-run-review.jpg',
          alt: 'Quick run review step with placement, container manifest, and the run request',
          caption: 'Review before launch: the request is shown verbatim.',
        },
      },
      {
        title: 'Follow the run',
        icon: 'Activity',
        paragraphs: [
          'The run page tracks Queued, Initializing, Running, and Finished, with the distributed record underneath: several nodes may plan the same [family](concept:glossary#run-family), and duplicate successes reconcile to one [canonical execution](concept:glossary#canonical-execution).',
          'On completion Aruna writes a Process Run [dataset](concept:datasets) with action, tool, inputs, outputs, status, and group. Open it from the run detail, or filter the [Datasets](page:datasets) view by Process Run.',
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
    summary: 'Send a group’s uploads to your own S3-compatible storage.',
    tour: [
      {
        route: '/app',
        anchor: 'nav-groups',
        title: 'Open Groups',
        body: 'Backends are group configuration; open the group that should own the backend.',
      },
      {
        route: '/app/groups',
        anchor: 'group-tabs',
        title: 'The Storage tab',
        body: 'The Storage tab of a group registers backends and sets the default storage backend.',
      },
    ],
    sections: [
      {
        title: 'Requirements',
        icon: 'ListChecks',
        paragraphs: [
          'Group ADMIN [role](concept:glossary#role), the endpoint details, and credentials meant for Aruna. Backend credentials are neither [portal sessions](concept:storage-access#portal-s3-session) nor [S3 access keys](concept:storage-access#s3-access-key).',
        ],
      },
      {
        title: 'Configure',
        icon: 'HardDrive',
        steps: [
          'Open the group from [Groups](page:groups) and switch to its Storage tab.',
          'Add the endpoint and [backend](concept:storage-access#external-storage-backend) credentials; verify endpoint and certificate first.',
          'Enable the backend and make it the default storage backend only after the connection check succeeds.',
          'Writers inherit the backend but can never reveal or replace the secret.',
        ],
        image: {
          src: '/docs/v1/group-storage.jpg',
          alt: 'Group storage tab with the storage backends section and add backend button',
          caption: 'Backends live on the group: uploads land in your own object storage.',
        },
      },
    ],
  },
  {
    slug: 'cli-access-key',
    kind: 'Guide',
    title: 'Create an S3 access key',
    summary: 'A long-lived, node-local S3 key for a client outside the portal.',
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
        icon: 'Shield',
        paragraphs: [
          'The portal itself uses short-lived [sessions](concept:storage-access#portal-s3-session). Create an [S3 access key](concept:storage-access#s3-access-key) only for a tool that cannot use that flow.',
          'The key signs S3 requests and authenticates the GA4GH TES facade over HTTP Basic. It never authenticates the REST API, which takes a bearer token issued as a session.',
        ],
      },
      {
        title: 'Create and store safely',
        icon: 'KeyRound',
        steps: [
          'Open [Settings](page:settings), then Access & connection.',
          'Confirm the issuing [node](concept:glossary#node), restrictions, and the intended client.',
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
        body: 'Once a provider shows Ready, an assistant button appears here in the top bar and Assistant joins the sidebar. Without a provider neither is shown.',
      },
    ],
    sections: [
      {
        title: 'Bring your own provider',
        icon: 'Bot',
        paragraphs: [
          'The in-portal assistant runs on a provider you configure: Claude, OpenAI, an OpenAI-compatible or local endpoint, or a ChatGPT subscription.',
          'API keys stay in this browser tab and are never sent to Aruna; only a ChatGPT sign-in is kept by the [node](concept:glossary#node).',
        ],
      },
      {
        title: 'Add a provider',
        icon: 'CirclePlus',
        steps: [
          'Open [Settings](page:settings), then the Assistant tab.',
          'Choose Add provider.',
          'Sign in to ChatGPT, or paste a key for a local or compatible model endpoint.',
          'Wait for the provider to show Ready.',
        ],
        image: {
          src: '/docs/v1/assistant-add.jpg',
          alt: 'Add provider dialog with Claude, OpenAI, OpenAI-compatible, and ChatGPT options',
          caption: 'Four provider kinds: a browser-held key, or a ChatGPT sign-in the node keeps.',
        },
      },
      {
        title: 'Use it everywhere',
        icon: 'Sparkles',
        paragraphs: [
          'Once a provider is ready the assistant button appears in the top bar and Assistant joins the sidebar.',
          'Each turn tells the model the route you are on, plus a few details from the [dataset](concept:datasets), [bucket](concept:data-and-deletion#buckets-hold-the-bytes), and [group](concept:realm-nodes-groups#groups-own-your-work) views. It acts through the tools this node serves over [MCP](concept:glossary#mcp) and, while the dataset editor is open, on the draft; writes ask you first, and only you save the draft.',
        ],
        image: {
          src: '/docs/v1/assistant-chat.jpg',
          alt: 'Assistant chat answering a datasets question with three MCP tool calls and a result table',
          caption: 'A turn that answered by calling the node’s own MCP tools and rendering the result.',
        },
      },
      {
        title: 'Connect an MCP client',
        icon: 'Plug',
        paragraphs: [
          'The client authenticates with a [session](concept:glossary#session) token of its own, so revoking it never signs you out of the portal.',
        ],
        steps: [
          'Copy the [MCP](concept:glossary#mcp) endpoint of this node.',
          'Pick the client, for example Claude Code.',
          'Create a labeled client session and copy the token; it is shown once.',
          'Find and revoke the session later under Sessions.',
        ],
        image: {
          src: '/docs/v1/assistant-providers.jpg',
          alt: 'Assistant settings with a Ready provider and the connect-an-MCP-client card',
          caption: 'A ready provider powers the panel; the MCP endpoint below wires external clients.',
        },
      },
    ],
  },
  {
    slug: 'datasets',
    kind: 'Concept',
    title: 'Data, metadata, and datasets',
    summary: 'Your files, the description of them, and the bundle that keeps both together.',
    sections: [
      {
        title: 'Start with your files',
        icon: 'Files',
        paragraphs: [
          'Data means the files your work produces: the measurements, images, sequences, spreadsheets, and readings themselves.',
          'Metadata is the description of that data: what it is, who made it, when, with which instruments and methods, under which license, and who contributed.',
          'A dataset is both together: a collection of data and its metadata, bundled as one unit. Because the two travel as a whole, the description cannot drift away from the files it describes.',
        ],
      },
      {
        title: 'The bundle is an RO-Crate',
        icon: 'Package',
        paragraphs: [
          'Aruna packages every dataset as an [RO-Crate](https://www.researchobject.org/ro-crate/), an open standard for bundling data with its description. You never have to touch the format; the editor writes it for you.',
          'Because the format is a standard, you can export a dataset, share it, and import it elsewhere with its description intact.',
        ],
      },
      {
        title: 'From description to answers',
        icon: 'Waypoints',
        paragraphs: [
          'Inside the bundle, every statement links to the thing it describes: a file to the instrument that produced it, the instrument to its operator, the whole dataset to its license. Together those links form a graph of connected information.',
          'The graph is what makes the catalog useful. You can ask questions across every dataset at once and trust the answers, and the portal can check a description against a [Profile](concept:profiles-conformance) instead of leaving completeness to the eye.',
          'The query language behind those questions is [SPARQL](https://www.w3.org/TR/sparql11-overview/); the [Datasets](page:datasets) view carries a workbench for it when you are ready.',
        ],
      },
      {
        title: 'One catalog, three purposes',
        icon: 'Tags',
        paragraphs: ['Every entry in the catalog is a dataset; its purpose decides how it is shown.'],
        bullets: [
          'Dataset is the default purpose: data described and bundled as above.',
          'Profile: a dataset whose root declares the Profile type. It defines requirements for other datasets.',
          'Process Run: a dataset conforming to the Process Run Crate profile. It records a computation.',
          'Purpose changes presentation only; none of the three is a separate storage system.',
        ],
      },
      {
        title: 'Description and data are separate',
        icon: 'Split',
        paragraphs: [
          'The dataset record is the graph. The file bytes live in [buckets](concept:data-and-deletion) or external locations, and editing or deleting the record never silently touches them.',
        ],
      },
      {
        title: 'Create or import',
        icon: 'CirclePlus',
        bullets: [
          'Create dataset starts a new portal-authored RO-Crate and lets you choose its owning [group](concept:realm-nodes-groups) and an optional Profile.',
          'Import RO-Crate dataset accepts an existing RO-Crate archive, previews it, and registers it as a new dataset.',
          'These are separate intents. Import does not overwrite an existing dataset unless an explicit replacement workflow says so.',
        ],
      },
      {
        title: 'RO-Crate version compatibility',
        icon: 'History',
        bullets: [
          'RO-Crate 1.2 and 1.3 are supported for import, validation, and round-trip export.',
          'New portal-authored datasets currently emit RO-Crate 1.2. Importing and exporting an existing 1.3 archive preserves its declared version.',
          'RO-Crate 1.1 remains supported for reading.',
        ],
      },
    ],
  },
  {
    slug: 'realm-nodes-groups',
    kind: 'Concept',
    title: 'Groups, nodes, and the realm',
    summary: 'Who owns your work, which server answers you, and how copies spread.',
    sections: [
      {
        title: 'Groups own your work',
        icon: 'Users',
        paragraphs: [
          'Everything you create belongs to a group: every [dataset](concept:datasets), bucket, and compute run. A group carries ownership, [roles](concept:glossary#role), [quota](concept:glossary#quota), and configured storage behavior; the [Groups](page:groups) view manages all of it.',
          '[Membership](concept:glossary#membership) connects you to roles inside a group, and the node evaluates the resulting permissions on every protected action. Your role, not your account, decides what you may do.',
        ],
      },
      {
        title: 'Nodes and the realm',
        icon: 'Globe',
        paragraphs: [
          'A node is one Aruna server: the REST and S3 authority your browser talks to, and the scope of local storage and placement reports.',
          'Nodes join into a realm. The realm scopes visibility and membership and adds the realm-wide aggregates on the dashboard. The [Status](page:status) view shows the realm, its locations, and every node.',
        ],
        image: {
          src: '/docs/v1/status.jpg',
          alt: 'Status view with realm topology, locations, and the list of realm nodes',
          caption: 'The Status view: the realm, its locations, and every node with role, latency, and connectivity.',
        },
      },
      {
        title: 'Replication is not a unique total',
        icon: 'Copy',
        paragraphs: [
          'A dataset can be held by several nodes at once; each copy is a replica. Holder counts include replicas, so summing nodes can exceed the number of unique datasets.',
          'A default replica count in [record placement](concept:glossary#record-placement) is a target, not proof of current copies, and an unset default can mean all eligible nodes.',
        ],
      },
      {
        title: 'Read scope badges before acting',
        icon: 'Eye',
        paragraphs: [
          'Realm, node, and group badges name the authority an action uses. Switching one changes the context you act in, not just a display filter.',
        ],
      },
    ],
  },
  {
    slug: 'data-and-deletion',
    kind: 'Concept',
    title: 'Data, buckets, and deletion',
    summary: 'Where file bytes live, what a dataset references, and what each kind of delete touches.',
    sections: [
      {
        title: 'Buckets hold the bytes',
        icon: 'Database',
        paragraphs: [
          'Files live as [objects](concept:glossary#object) in buckets, served over S3 by a [node](concept:realm-nodes-groups) and browsed in the [Data manager](page:buckets).',
          'A [dataset](concept:datasets) references file identities or locations; it never owns the stored bytes, and one content identity can have several replicas.',
          'Deletion checks warn about visible references and about removing the last resolvable location. Warnings inform; storage permissions decide.',
        ],
      },
      {
        title: 'Delete is recoverable',
        icon: 'Trash2',
        bullets: [
          'Delete writes a [delete marker](concept:glossary#delete-marker): the file leaves the listing and every earlier version stays.',
          'Show deleted in the object browser lists the files whose newest version is a delete marker.',
          'Restore removes that marker, so the newest earlier version is the current one again.',
          'A delete marker frees no storage: the data keeps using your quota until it is deleted permanently.',
          'Deleting a dataset removes its description, never the stored objects it references.',
        ],
      },
      {
        title: 'Every write keeps a version',
        icon: 'History',
        paragraphs: [
          'Versioning is always on. The Versions tab of a file lists every version and delete marker the connected node holds for it, newest first, with the current one marked.',
          'Make current copies an older version back onto the file. That creates a new version, and the old one keeps using its bytes until it is deleted permanently.',
          'Delete this version removes exactly one version on this node and frees its bytes. Nothing brings it back.',
        ],
      },
      {
        title: 'What the reference check covers',
        icon: 'Search',
        bullets: [
          'Before a delete, the node asks every reachable [node](concept:realm-nodes-groups#nodes-and-the-realm) of the realm which datasets reference the target, under each identifier form the content is known by: its canonical content w3id and the legacy S3 and path-style addresses of the same bytes.',
          'A form no node can resolve is reported as not queried. A reference recorded only under that form stays invisible to the check.',
          'Index current means a node has finished indexing what it holds. A pending, mixed, or failed index can miss a reference that already exists.',
          'A node that does not answer, a truncated page, or a partial realm view leaves the coverage incomplete. The dialog says so, and an empty result is then not proof that no dataset references the target.',
          'The check informs the decision; storage permissions decide whether the delete is allowed.',
        ],
      },
      {
        title: 'Delete permanently is separate',
        icon: 'Eraser',
        paragraphs: [
          'Delete permanently removes every version and delete marker of a file, folder or bucket on the node you are connected to, aborts its open uploads, and reports what it committed. Nothing brings them back, and a node that holds its own copy keeps it.',
          'Delete bucket lives in the danger zone of the bucket\'s Storage page. It also settles the sync relationships that point at the bucket, proves the bucket is empty, and only then removes it.',
          'Everything destructive starts in the same dialog: it names the target and the node, shows what the target contains, and asks you to type the name for a folder or a bucket.',
        ],
      },
    ],
  },
  {
    slug: 'profiles-conformance',
    kind: 'Concept',
    title: 'Profiles and conformance',
    summary: 'What a Profile requires from a dataset, and which validation check has the final word.',
    sections: [
      {
        title: 'Profiles define minimum requirements',
        icon: 'ListChecks',
        paragraphs: [
          'A Profile lists the fields and entities expected for a kind of [dataset](concept:datasets): a checklist of what a complete description contains. Extra metadata stays valid unless a closed SHACL constraint forbids it.',
          'The rules behind a Profile are written in [SHACL](https://www.w3.org/TR/shacl/), and each registered Profile on the [Profiles](page:profiles) page offers its shapes for download.',
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
        icon: 'ShieldCheck',
        bullets: [
          'The editor preview checks drafts early; it advises and never blocks the form.',
          'The [node](concept:realm-nodes-groups) validates the exact saved crate against the exact Profile revision it declares before accepting a tagged write.',
          'An unavailable or still-preparing Profile fails closed for tagged writes: retry, or save unprofiled.',
          'External Profile references, and group-only Profiles of another group, stay readable but cannot be enforced as write tags; see [Visibility and registration](concept:build-a-profile#visibility-and-registration).',
        ],
      },
      {
        title: 'Changing Profile',
        icon: 'RefreshCw',
        paragraphs: [
          'Switching a saved dataset to another Profile must pass authoritative validation. Unmatched metadata is kept for review, never dropped silently.',
        ],
      },
    ],
  },
  {
    slug: 'identifiers',
    kind: 'Concept',
    title: 'Identifiers and w3id PIDs',
    summary: 'The permanent identifier every dataset gets, and the identifiers you bring yourself.',
    sections: [
      {
        title: 'One automatic primary w3id',
        icon: 'Fingerprint',
        paragraphs: [
          'Every persisted [dataset](concept:datasets) gets exactly one conceptual w3id: a permanent web address that keeps resolving as things move. A [Profile](concept:profiles-conformance) uses https://w3id.org/aruna/profile/{id} instead of a duplicate general id.',
          'Minting can continue after the write is accepted, and every PID state stays visible. Deletion keeps a resolvable tombstone, and owners cannot withdraw the primary PID.',
        ],
      },
      {
        title: 'External identifiers are metadata',
        icon: 'Link2',
        paragraphs: [
          'A DOI, accession, or local code you already have is ordinary metadata in the dataset graph; entering it requests nothing from any registry. Extra PID providers appear only when one is configured.',
        ],
      },
      {
        title: 'File identities',
        icon: 'Hash',
        paragraphs: [
          'Aruna-held bytes get a content-addressed https://w3id.org/aruna/data/{blake3-hex} derived from the bytes themselves; contentUrl records a location. Imported external content keeps its source identity.',
        ],
      },
    ],
  },
  {
    slug: 'storage-access',
    kind: 'Concept',
    title: 'Sessions, keys, and storage backends',
    summary: 'Three S3 mechanisms with different owners, lifetimes, and uses.',
    sections: [
      {
        title: 'Portal S3 session',
        icon: 'Clock',
        paragraphs: [
          'Browsing the [Data manager](page:buckets) uses a short-lived SigV4 session for one selected [group](concept:realm-nodes-groups): held in memory only, valid for at most one hour or the remaining sign-in lifetime, and refreshed shortly before expiry.',
          'A session is issued by one node and works only there. Sign-out, account change, or API change clears it.',
        ],
      },
      {
        title: 'S3 access key',
        icon: 'KeyRound',
        paragraphs: [
          'An optional long-lived key pair for S3 clients outside the portal, created under [Settings](page:settings). The secret is shown once, is never stored by the portal, and stays local to the issuing node.',
          'The same key authenticates the GA4GH TES facade over HTTP Basic. It never authenticates the REST API: that takes a bearer token, issued and revoked as a session.',
        ],
      },
      {
        title: 'External storage backend',
        icon: 'HardDrive',
        paragraphs: [
          'Group configuration, not a browser credential: an admin registers an S3-compatible endpoint, and group or bucket rules send new uploads there. Writers inherit the backend but never see the secret; see [Storage backend](concept:where-data-lives#storage-backend).',
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
        icon: 'Gauge',
        paragraphs: [
          'Aruna runs on several [nodes](concept:realm-nodes-groups), so an answer can be settled on one node while another is still catching up. Each state names exactly what has been established so far.',
        ],
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
        icon: 'RefreshCw',
        paragraphs: [
          'Retry rechecks or resumes safely repeatable work. A timed-out read after Accepted does not mean the write failed, and the portal never auto-replays an uncertain mutation, because the first attempt may already have committed.',
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
        icon: 'Route',
        paragraphs: [
          'A run executes next to its data when possible and moves data to the compute when it must. The placement record tells you which happened, and why.',
          'Every [node](concept:realm-nodes-groups) holding a request family plans it independently: one round screens all executor advertisements in the realm and stores its choice only after the last page.',
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
        icon: 'Scale',
        bullets: [
          'Compute-to-data: every input already had a usable copy on the chosen node; expected transfer zero.',
          'Data-to-compute: at least one input had to move to the chosen node first.',
          'Not placed: the responding node stored no plan of its own; absence of local evidence only.',
          'The verdict describes the plan, never the measured outcome.',
        ],
      },
      {
        title: 'Input modes',
        icon: 'Import',
        bullets: [
          'Snapshot: copied as it was at run start; later writes never affect the run.',
          'Floating: resolved at run time; sees whatever is current, cannot name a version.',
          'Exact: pins one specific version id.',
          'GA4GH tasks carry no mode; the serving node derives one and never pins a version.',
        ],
      },
      {
        title: 'Outputs are exact versions',
        icon: 'FileJson',
        paragraphs: [
          'Outputs go to the buckets the run names, never to a bucket the run created for itself.',
          'Each output names the exact version one execution wrote, that execution, and the owning node-local S3 endpoint. Reading the key without the version id answers whatever is current instead.',
          'The owner endpoint can be unknown while version and execution stay exact; the portal says so rather than dropping the output.',
        ],
      },
      {
        title: 'Replicating data ahead of compute',
        icon: 'Copy',
        paragraphs: [
          'The storage locations view shows which nodes hold a copy. Requesting a copy elsewhere needs WRITE and is accepted as a queued request. A [replica](concept:realm-nodes-groups) on an executor node makes compute-to-data possible; the planner still decides.',
        ],
      },
      {
        title: 'Placement policies and record placement',
        icon: 'MapPin',
        bullets: [
          'A [placement policy](concept:where-data-lives#placement-policies) lists where a copy may be stored. It allows or refuses a copy and never creates one.',
          'A policy is immutable: changing a definition publishes a new policy id. The planner only reads inputs from copies a policy allows.',
          'Record placement is a separate machine: it decides which nodes hold dataset records and run families, never where files are stored.',
        ],
      },
    ],
  },
  glossaryTopic,
]

export function docsTopicBySlug(slug: string): DocsTopic | undefined {
  return docsTopics.find((topic) => topic.slug === slug)
}
