import type { DocsTopic } from './v1'

// The wiki's long tail: one tight definition per term, one section per term so
// every entry is directly linkable as concept:glossary#<term>. Terms that own
// a rich concept topic link onward to it.
export const glossaryTopic: DocsTopic = {
  slug: 'glossary',
  kind: 'Concept',
  title: 'Glossary',
  summary: 'Every term the portal uses, defined in a sentence or two.',
  sections: [
    {
      title: 'Dataset',
      icon: 'Package',
      paragraphs: [
        'A collection of data and its metadata, bundled and stored as one unit. The full story lives in [Data, metadata, and datasets](concept:datasets).',
      ],
    },
    {
      title: 'Data',
      icon: 'Files',
      paragraphs: [
        'The files your work produces: the measurements, images, sequences, spreadsheets, and readings themselves.',
      ],
    },
    {
      title: 'Metadata',
      icon: 'Tags',
      paragraphs: [
        'The description of data: what it is, who made it, when, with which instruments and methods, under which license, and who contributed.',
      ],
    },
    {
      title: 'RO-Crate',
      icon: 'Box',
      paragraphs: [
        'The open standard Aruna uses to [bundle a dataset](concept:datasets#the-bundle-is-an-ro-crate). The editor writes the format for you, and standard crates import and export cleanly.',
      ],
    },
    {
      title: 'Profile',
      icon: 'ListChecks',
      paragraphs: [
        'A dataset that defines the minimum metadata other datasets of its kind should carry. The node enforces it on tagged writes; see [Profiles and conformance](concept:profiles-conformance).',
      ],
    },
    {
      title: 'Root dataset',
      icon: 'Package',
      paragraphs: [
        'The one entity every [RO-Crate](concept:datasets#the-bundle-is-an-ro-crate) describes itself with. A [profile](concept:build-a-profile) keeps its rules in the Root dataset shape.',
      ],
    },
    {
      title: 'Shape',
      icon: 'Waypoints',
      paragraphs: [
        'The rules for one kind of thing in a profile, for example a Person. Every rule that references that type [reuses the same shape](concept:build-a-profile#entity-shapes-and-references).',
      ],
    },
    {
      title: 'Rule',
      icon: 'ListChecks',
      paragraphs: [
        'One property a shape asks for: which term, which kind of value, how many entries, and [how strictly](concept:build-a-profile#properties-and-obligations) it applies.',
      ],
    },
    {
      title: 'Obligation',
      icon: 'Scale',
      paragraphs: [
        'How strictly a rule applies: Required fails validation when missing, Recommended warns, Optional never complains.',
      ],
    },
    {
      title: 'Reference',
      icon: 'Link2',
      paragraphs: [
        'A rule whose value is another entity rather than text, for example an author that is a Person. It is what pulls a [shape](concept:build-a-profile#entity-shapes-and-references) into the dataset form.',
      ],
    },
    {
      title: 'Group-only profile',
      icon: 'Shield',
      paragraphs: [
        'A profile only the datasets of its own group may declare. [Making it public](concept:build-a-profile#visibility-and-registration) registers it under a permanent address for every dataset in the realm.',
      ],
    },
    {
      title: 'Purpose type',
      icon: 'Tag',
      paragraphs: [
        'What a catalog entry is for: Dataset, Profile, or Process Run. Purpose changes [how an entry is shown](concept:datasets#one-catalog-three-purposes), never where it is stored.',
      ],
    },
    {
      title: 'Graph',
      icon: 'Waypoints',
      paragraphs: [
        'The linked form of a dataset description: every statement connects to the thing it describes, so [questions can span the whole catalog](concept:datasets#from-description-to-answers).',
      ],
    },
    {
      title: 'SPARQL',
      icon: 'Braces',
      paragraphs: [
        'A [W3C standard](https://www.w3.org/TR/sparql11-overview/) query language for asking questions across the catalog graphs; the [Datasets](page:datasets) view carries a workbench for it.',
      ],
    },
    {
      title: 'Realm',
      icon: 'Globe',
      paragraphs: [
        'The federation of [nodes](concept:glossary#node) your portal lives in. It scopes visibility and membership and feeds the realm-wide numbers on the dashboard; see [Groups, nodes, and the realm](concept:realm-nodes-groups#nodes-and-the-realm).',
      ],
    },
    {
      title: 'Node',
      icon: 'Server',
      paragraphs: [
        'One Aruna server: the REST and S3 authority your browser talks to, and the scope of local storage and placement reports. Nodes join into a [realm](concept:realm-nodes-groups#nodes-and-the-realm).',
      ],
    },
    {
      title: 'Group',
      icon: 'Users',
      paragraphs: [
        'The owner of every dataset, bucket, and compute run. A group carries [roles](concept:glossary#role), [quota](concept:glossary#quota), and storage configuration; see [Groups, nodes, and the realm](concept:realm-nodes-groups#groups-own-your-work).',
      ],
    },
    {
      title: 'Role',
      icon: 'Shield',
      paragraphs: [
        'Your set of permissions inside one group, evaluated by the node on every protected action. Your role, not your account, decides what you may do.',
      ],
    },
    {
      title: 'Membership',
      icon: 'IdCard',
      paragraphs: [
        'The link between your account and a [group](concept:glossary#group) that assigns your roles there. Without a membership you can look around but store nothing.',
      ],
    },
    {
      title: 'Quota',
      icon: 'Gauge',
      paragraphs: [
        'A storage limit for a group, set by realm administrators as a realm-wide default plus per-group overrides. An unset quota means unlimited.',
      ],
    },
    {
      title: 'Bucket',
      icon: 'Database',
      paragraphs: [
        'An S3 container for stored objects, served by a node and browsed in the [Data manager](page:buckets); see [Data, buckets, and deletion](concept:data-and-deletion#buckets-hold-the-bytes).',
      ],
    },
    {
      title: 'Object',
      icon: 'File',
      paragraphs: [
        'One stored file in a bucket, addressed by its key. Versioning keeps its history, so one key can carry several versions.',
      ],
    },
    {
      title: 'Replica',
      icon: 'Copy',
      paragraphs: [
        'One node holding a copy of stored content; a dataset can be held by [several nodes at once](concept:realm-nodes-groups#replication-is-not-a-unique-total).',
      ],
    },
    {
      title: 'Replication',
      icon: 'Share2',
      paragraphs: [
        'Keeping copies on more than one node. Dataset records replicate by [record placement](concept:glossary#record-placement); file copies come from uploads, [bucket syncs](concept:glossary#bucket-sync) and explicit copy requests, never from a placement policy. A [replica count is a target](concept:realm-nodes-groups#replication-is-not-a-unique-total), not proof of current copies.',
      ],
    },
    {
      title: 'Placement policy',
      icon: 'ShieldCheck',
      paragraphs: [
        'A published, immutable rule listing where copies of governed data may be stored: a node, a location, a node label, an executor kind. It allows or refuses a copy and never creates, moves or removes one. Attaching it to a bucket governs the objects written afterwards; see [Where your data lives](concept:where-data-lives#placement-policies).',
      ],
    },
    {
      title: 'Copy',
      icon: 'Copy',
      paragraphs: [
        'One stored piece of an object version that a node can serve. Copies come from an upload, a [bucket sync](concept:glossary#bucket-sync), an explicit copy request, or staging a compute input.',
      ],
    },
    {
      title: 'Storage location',
      icon: 'MapPin',
      paragraphs: [
        'Where the copies of one version are right now, per node, with a state of present, pending, unreachable, denied or not stored. It is [the answering node\'s view](concept:where-data-lives#storage-locations) and can be incomplete.',
      ],
    },
    {
      title: 'Record placement',
      icon: 'Layers',
      paragraphs: [
        'Which nodes hold a dataset record or a system job, decided by a realm strategy with a replica count, shard count and label affinity. It never decides where files are stored; that is the [storage backend](concept:glossary#storage-backend) and [placement policies](concept:glossary#placement-policy).',
      ],
    },
    {
      title: 'Bucket sync',
      icon: 'Share2',
      paragraphs: [
        'A standing, one way mapping that mirrors a source bucket into a second bucket on a target node, which writes, owns and serves its own copies from then on. It runs once, continuously as versions are written, or in a reference mode that keeps pointers instead of data; see [Syncs](concept:where-data-lives#syncs).',
        'Aruna Desktop uses the word Sync for something else: a folder on your computer kept in step with a bucket. A bucket sync connects two buckets and involves no computer of yours.',
      ],
    },
    {
      title: 'Delete marker',
      icon: 'Trash2',
      paragraphs: [
        'The version a plain Delete writes: the file leaves the listing while [every earlier version stays](concept:data-and-deletion#delete-is-recoverable). Show deleted lists such files, and Restore removes the marker.',
      ],
    },
    {
      title: 'Show deleted',
      icon: 'Eye',
      paragraphs: [
        'The object browser toggle that lists the files whose newest version is a [delete marker](concept:glossary#delete-marker), each with a Restore action.',
      ],
    },
    {
      title: 'Restore',
      icon: 'RotateCcw',
      paragraphs: [
        'Deletes the delete marker of a file, so the newest earlier version is the current one again. Nothing is copied and the quota does not change.',
      ],
    },
    {
      title: 'Delete permanently',
      icon: 'Eraser',
      paragraphs: [
        'Removes every version and delete marker of a file, folder or bucket on this node; other nodes keep their copies. It runs as a system job the API calls a purge, and nothing brings the data back; see [Delete permanently is separate](concept:data-and-deletion#delete-permanently-is-separate).',
      ],
    },
    {
      title: 'Watch',
      icon: 'Eye',
      paragraphs: [
        'A subscription to a bucket folder or a dataset path: new uploads under the folder, or new datasets under the path, appear as notifications under the bell. Notifications are in-app only and kept for 30 days. Stop a watch from its Watch button or under [Settings](page:settings), Watched resources.',
      ],
    },
    {
      title: 'PID',
      icon: 'Fingerprint',
      paragraphs: [
        'A persistent identifier: a permanent web address that keeps resolving as things move. Every dataset gets [exactly one primary PID](concept:identifiers).',
      ],
    },
    {
      title: 'w3id',
      icon: 'Link2',
      paragraphs: [
        'The scheme at w3id.org that Aruna mints its PIDs under. Deletion keeps a resolvable tombstone; see [Identifiers and w3id PIDs](concept:identifiers).',
      ],
    },
    {
      title: 'Session',
      icon: 'Clock',
      paragraphs: [
        'A short-lived credential: the browser holds an [S3 session](concept:storage-access#portal-s3-session) for one group, and an MCP client connects with a token of its own. Sessions are listed and revocable under [Settings](page:settings).',
      ],
    },
    {
      title: 'Access key',
      icon: 'KeyRound',
      paragraphs: [
        'A long-lived, node-local S3 key pair for [tools outside the portal](concept:storage-access#s3-access-key). The secret is shown once and never stored by the portal. It does not authenticate the REST API, which takes a bearer token.',
      ],
    },
    {
      title: 'Storage backend',
      icon: 'HardDrive',
      paragraphs: [
        'The physical store behind one node that receives an upload: the node operator\'s own store, or an S3-compatible endpoint [registered on a group](concept:storage-access#external-storage-backend). Writers inherit it but never see the backend secret.',
        'Which backend takes a write is decided per write by routing rules, most specific first: exact key, longest key prefix, bucket default, group default, then the node\'s own rules. See [Storage backend](concept:where-data-lives#storage-backend).',
      ],
    },
    {
      title: 'Completion state',
      icon: 'CircleCheck',
      paragraphs: [
        'The label that says how settled an answer is: Accepted, Preparing, Complete, Partial, Unknown, or Unavailable. [Each names exactly what has been established](concept:states-and-retry).',
      ],
    },
    {
      title: 'Retry',
      icon: 'RefreshCw',
      paragraphs: [
        'Rechecking or resuming safely repeatable work. The portal [never auto-replays an uncertain mutation](concept:states-and-retry#retry-without-inventing-an-outcome), because the first attempt may already have committed.',
      ],
    },
    {
      title: 'Compute run',
      icon: 'Play',
      paragraphs: [
        'One requested execution: a container with a command, inputs, and outputs, run under a [group](concept:glossary#group) with recorded provenance. A finished run is written up as a Process Run dataset.',
      ],
    },
    {
      title: 'Compute job',
      icon: 'Wrench',
      paragraphs: [
        'Background work a node runs for your account, such as staging, provenance, and maintenance. Jobs appear beside your runs in the [Compute](page:compute) view; you can follow or cancel one, never start one.',
      ],
    },
    {
      title: 'Run family',
      icon: 'GitBranch',
      paragraphs: [
        'The records one requested run produces across the realm: [every node holding the request plans it independently](concept:data-to-compute), so one run can have several planning records.',
      ],
    },
    {
      title: 'Result execution',
      icon: 'BadgeCheck',
      paragraphs: [
        'The single execution a [run family](concept:glossary#run-family) reconciles its duplicate successes to. Outputs and provenance point at it.',
      ],
    },
    {
      title: 'Run placement',
      icon: 'Route',
      paragraphs: [
        'The decision where a run executes: [next to its data when possible, moving data when it must](concept:data-to-compute). The placement record tells you which happened, and why. It is decided per run, unlike a [placement policy](concept:glossary#placement-policy), which governs a bucket.',
      ],
    },
    {
      title: 'Verdict',
      icon: 'Scale',
      paragraphs: [
        'The placement plan summary: [compute-to-data, data-to-compute, or not placed](concept:data-to-compute#what-the-verdict-means). It describes the plan, never the measured outcome.',
      ],
    },
    {
      title: 'Compute-to-data',
      icon: 'MapPin',
      paragraphs: [
        'The [verdict](concept:data-to-compute#what-the-verdict-means) when every input already had a usable copy on the chosen node: the run travels, the data stays, expected transfer zero.',
      ],
    },
    {
      title: 'Data-to-compute',
      icon: 'Send',
      paragraphs: [
        'The [verdict](concept:data-to-compute#what-the-verdict-means) when at least one input had to move to the chosen node before the run could start.',
      ],
    },
    {
      title: 'Assistant',
      icon: 'Bot',
      paragraphs: [
        'The in-portal AI panel, powered by a provider you configure and acting through the node MCP tools. [Turn on the assistant](concept:assistant) shows the setup.',
      ],
    },
    {
      title: 'MCP',
      icon: 'Plug',
      paragraphs: [
        'The Model Context Protocol: the interface this node serves so AI clients, inside and outside the portal, can [call its tools](concept:assistant#connect-an-mcp-client).',
      ],
    },
  ],
}
