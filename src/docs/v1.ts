import { glossaryTopic } from './glossary'

export const docsVersion = 'v1'

export type DocsTopicKind = 'Concept' | 'Guide'

export interface DocsImage {
  src: string
  alt: string
  caption?: string
}

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
          'Sign-in lands on the [dashboard](page:dashboard): [realm](concept:realm-nodes-groups#nodes-and-the-realm) statistics, node storage, and your [groups](concept:realm-nodes-groups#groups-own-your-work), live from the [node](concept:glossary#node) your browser talks to.',
        ],
        image: {
          src: '/docs/v1/dashboard.jpg',
          alt: 'Portal dashboard with realm statistics, storage figures, and group overview',
          caption: 'The dashboard: realm statistics on top, node storage below, your groups at the bottom.',
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
        body: 'Type a bucket name under the bucket list and confirm; bucket names are lowercase, digits, and dashes.',
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
        title: 'Bucket settings',
        body: 'The cogwheel holds routing, which storage backend takes the writes, and placement, where copies of the data are kept.',
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
          'Type a [bucket](concept:data-and-deletion#buckets-hold-the-bytes) name under the bucket list and confirm. Names use lowercase letters, digits, and dashes.',
          'Select the bucket, then drag files in or use Add data.',
          'Watch the Transfers panel until every file reports done.',
        ],
        image: {
          src: '/docs/v1/data-browser.jpg',
          alt: 'Data view with the reef-survey-2026 bucket and two uploaded objects',
          caption: 'A bucket with uploaded objects; the toolbar reaches watch, bucket settings, and sync.',
        },
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
    summary: 'Placement, routing, and sync: which nodes hold copies, which backend takes the writes, and when a second bucket is the answer.',
    sections: [
      {
        title: 'Names stay local, bytes travel',
        icon: 'Server',
        paragraphs: [
          'The S3 name of an [object](concept:glossary#object), its bucket and key on one node, is served only by that node: an S3 request against node-x always goes to node-x, and placement never changes that.',
          'The bytes underneath are different: they are content-addressed blobs that can hold verified copies on other [realm](concept:realm-nodes-groups#nodes-and-the-realm) nodes. Losing a node loses its names, not the data, as long as copies exist elsewhere.',
        ],
      },
      {
        title: 'Placement: copies across nodes',
        icon: 'Copy',
        paragraphs: [
          'A placement policy is a realm-published rule such as "keep two copies" or "keep a copy at institute X". Attaching policies to a bucket, in the [bucket settings](page:buckets) behind the cogwheel, declares where copies of its data must live.',
          'New objects follow the policies as they are written; the coverage view shows how many existing objects already comply, and a catch-up run applies the policies to everything older.',
          'Copies exist for three reasons: durability when a node dies, [compute scheduling](concept:data-to-compute), and location-aware reads for tools that fetch by content rather than by name.',
        ],
      },
      {
        title: 'Routing: backends behind this node',
        icon: 'Route',
        paragraphs: [
          'Routing decides which physical storage receives the bytes a node accepts: the node\'s own store or a [storage backend](concept:storage-access#external-storage-backend) your group runs, such as an S3 or Azure account.',
          'It answers a different question than placement: placement chooses across nodes, routing chooses behind one node. Rules apply per key, per prefix, per bucket, or as a group default, with the most specific rule winning.',
        ],
      },
      {
        title: 'Data to compute, compute to data',
        icon: 'Send',
        paragraphs: [
          'A [compute run](concept:compute-run) that names inputs like node-x/bucket/key is not pinned to node-x. The planner routes the job to any node that holds the input blobs, so more placement copies mean more candidate nodes for a run.',
          'If no reachable node holds the inputs, submission is refused and asks you to replicate first: submit from a node that holds the inputs, or attach a placement policy and let the copies catch up.',
          'The same mechanism works in both directions: [bring data to where compute is available, or send compute to where the data already lives](concept:data-to-compute#what-the-verdict-means).',
        ],
      },
      {
        title: 'Sync or placement?',
        icon: 'Split',
        paragraphs: [
          'Both move data between nodes, but they answer different needs. Placement replicates the bytes of one bucket so its copies satisfy your durability and compute rules; nothing new appears anywhere, the bucket stays the single place where the data is named and served.',
          'A bucket sync relationship instead mirrors a source bucket into a second bucket on a target node: the target checks its own write permission, writes its own copies, and owns them from then on as an independently served bucket with its own lifecycle.',
          'Use placement when you care about one dataset surviving node loss, feeding compute, or being read by content. Use sync when another node or group should hold a real, name-addressable copy of its own: a partner mirror, a hand-off, or a migration. Sync runs once, continuously as versions are written, or in a reference mode that preserves references instead of copying bytes.',
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
          'Optionally pick a registered [Profile](concept:profiles-conformance); preview findings advise, never block.',
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
          'Choose Add files in the left panel.',
          'Pick From a bucket, select the [bucket](concept:data-and-deletion#buckets-hold-the-bytes), tick the [objects](concept:glossary#object).',
          'Add the selection; the files become entities of the dataset [graph](concept:glossary#graph).',
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
        icon: 'ListChecks',
        paragraphs: [
          'Group ADMIN [role](concept:glossary#role), the endpoint details, and credentials meant for Aruna routing. Backend credentials are neither [portal sessions](concept:storage-access#portal-s3-session) nor [S3 access keys](concept:storage-access#s3-access-key).',
        ],
      },
      {
        title: 'Configure',
        icon: 'HardDrive',
        steps: [
          'Open the group from [Groups](page:groups) and switch to its Storage tab.',
          'Add the endpoint and [backend](concept:storage-access#external-storage-backend) credentials; verify endpoint and certificate first.',
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
          'Each turn tells the model the route you are on, plus a few facts from the [dataset](concept:datasets), [bucket](concept:data-and-deletion#buckets-hold-the-bytes), and [group](concept:realm-nodes-groups#groups-own-your-work) views. It acts through the tools this node serves over [MCP](concept:glossary#mcp) and, while the dataset editor is open, on the draft; writes ask you first, and only you save the draft.',
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
          'A default replication factor is policy, not proof of current copies, and an unset default can mean all eligible nodes.',
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
        title: 'Delete markers are recoverable history',
        icon: 'Trash2',
        bullets: [
          'File Delete is a version-less S3 delete: it adds a delete marker and keeps every historical version.',
          'Folder Delete applies the same to the current keys under the prefix; it may finish partially and reports what remains.',
          'Deleting a dataset record removes its graph, never the referenced S3 objects.',
        ],
      },
      {
        title: 'Permanent purge is separate',
        icon: 'Eraser',
        paragraphs: [
          'Permanently delete all versions is an explicit node-side purge with resumable progress.',
          'Full bucket deletion also aborts open multipart uploads, settles sync relationships, proves emptiness, and only then removes the bucket.',
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
          'The [node](concept:realm-nodes-groups) validates the exact saved crate against the exact registered Profile revision before accepting a tagged write.',
          'An unavailable or still-preparing Profile fails closed for tagged writes: retry, or save unprofiled.',
          'External and unregistered Profile references stay readable but cannot be enforced as write tags.',
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
          'Every [node](concept:realm-nodes-groups) holding a request family plans it independently: one round screens all executor advertisements in the realm and seals its choice only after the last page.',
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
          'Not placed: the responding node sealed no plan of its own; absence of local evidence only.',
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
        title: 'Placement policies and the run-family strategy',
        icon: 'MapPin',
        bullets: [
          'A [placement policy](concept:where-data-lives#placement-copies-across-nodes) is immutable; a reference is its id plus the digest of the definition.',
          'Changing a definition means a new policy id. The planner only routes inputs from compliant copies.',
          'The run-family strategy places the run records themselves; it cannot be removed and is shown read-only.',
        ],
      },
    ],
  },
  glossaryTopic,
]

export function docsTopicBySlug(slug: string): DocsTopic | undefined {
  return docsTopics.find((topic) => topic.slug === slug)
}
