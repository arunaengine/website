Aruna starts its next chapter today as **Aruna V3** opens for public testing at [v3.aruna-engine.org](https://v3.aruna-engine.org). As a **FAIR and federated data orchestration engine**, **Aruna V3** lets your organization run its own data infrastructure and keep full authority over its data. At the same time, you can share that data with partners across institutional borders.

## Enabling organizations to own their data infrastructure

Your organization can now **operate its own node** to decide where its data lives and who may use it. We built **Aruna V3** from the ground up because research data lives across many institutions that want to stay in control of their own storage and access rules. Aruna V2 powers this site today and has a more traditional architecture with one central server and data proxies, so it is not fully federated. Its metadata also follows a fixed hierarchy from projects down to objects.

Nodes that trust each other form a realm for an institute, a consortium or a project. Because a realm has **no central server**, your node keeps working while other nodes are offline and shares its changes again once they reconnect. You can explore the concepts behind this model in [Groups, nodes, and the realm](https://v3.aruna-engine.org/app/docs/v1/realm-nodes-groups).

## Data orchestration across institutions

You can **coordinate storage and analysis** across your entire realm as **Aruna V3** decides where data lives and where work runs across all nodes.

- **Compute where it makes sense.** You can move your analysis job to the data or bring the data to the job. Large or restricted datasets stay on their home node while your analysis runs right next to them. When another site suits the job better, Aruna stages the data there and returns the results to the same governed place. You can read more in [Data-to-compute and compute-to-data](https://v3.aruna-engine.org/app/docs/v1/data-to-compute).
- **Placement policies.** You can define where data may be stored and served through signed policies. These policies travel with every copy and new version, so staging or copying never strips a restriction.
- **Data-aware scheduling.** The scheduler tracks which nodes already hold a verified copy of the input data and prefers those nodes when placing work.
- **Safe transfers.** Aruna checks every file when storing and copying it, which detects data corruption early.
- **Standard interfaces.** You can launch analysis containers from the portal or through the [GA4GH TES](https://www.ga4gh.org/product/task-execution-service-tes/) interface, as shown in [Start and follow a compute run](https://v3.aruna-engine.org/app/docs/v1/compute-run). You can also [work in Jupyter notebooks](https://v3.aruna-engine.org/app/docs/v1/notebooks) with direct access to your data.

## Metadata as a semantic graph

You can now describe your datasets and their connections in a **flexible semantic graph**. Aruna V2 groups datasets and objects under projects and collections with key-value labels and relations, whereas **Aruna V3** replaces this rigid model with a graph. The guide [Data, metadata, and datasets](https://v3.aruna-engine.org/app/docs/v1/datasets) gives an overview of how this works.

- **Linked data.** You describe every dataset as linked data with [RO-Crate](https://www.researchobject.org/ro-crate/). A crate describes the files together with the people involved, and it can also record the instruments, software and workflows used. You can query this graph with SPARQL, and [Create your first dataset](https://v3.aruna-engine.org/app/docs/v1/first-dataset) walks you through the first steps.
- **Provenance graph.** Crates reference other crates to connect source data with the analyses that produced each result. This graph lets you trace how a result was produced and what you need to reproduce it.
- **Profiles and quality checks.** You can define metadata requirements with profiles written as [SHACL](https://www.w3.org/TR/shacl/) shapes that specify what a complete description contains. Aruna then highlights missing information while the node validates every write, as shown in [Profiles and conformance](https://v3.aruna-engine.org/app/docs/v1/profiles-conformance) and [Build a profile](https://v3.aruna-engine.org/app/docs/v1/build-a-profile).
- **Versions and Git.** Every dataset keeps a full history that lets you compare versions and merge draft changes. Because each dataset is also a Git repository in the [ARC](https://arc-rdm.org/) layout, you can [clone it to work on branches](https://v3.aruna-engine.org/app/docs/v1/dataset-git) and push changes back.
- **Publish and harvest.** You can [publish datasets with a DOI](https://v3.aruna-engine.org/app/docs/v1/invenio-zenodo) to [Zenodo](https://zenodo.org/) or other InvenioRDM repositories and keep both in sync. External services can harvest your metadata through OAI-PMH and reference your data through GA4GH DRS.

## Data virtualization

You can access files across multiple physical storage locations through a **single virtual bucket** in **Aruna V3**. The guide [Where your data lives](https://v3.aruna-engine.org/app/docs/v1/where-data-lives) explains how this virtual view works.

- **Unified namespace.** You can combine local files and copies with references to files on other nodes inside a single bucket.
- **No needless copies.** Aruna serves each authorized read from wherever the bytes are stored, so reading a file from another node does not create a local copy.
- **Existing storage and tools.** You can keep data on local disks or [connect other storage systems](https://v3.aruna-engine.org/app/docs/v1/storage-backend) to a node. Every node offers an S3-compatible interface, so your existing tools and workflow systems keep working.

## More in Aruna V3

**Aruna V3** also brings **search across the whole realm** and a much simpler setup for your daily work.

- **Search across nodes.** You can find datasets across all connected nodes in a realm, with results limited to what you are allowed to see.
- **Automatic merging.** Nodes automatically combine edits made in different locations when they reconnect, including changes made while a node was offline.
- **Clear access control.** You sign in with your institution's OIDC provider, and membership in a realm grants no access by itself. Access is always granted explicitly, for example through a group or a role.
- **Encrypted buckets.** You can configure a bucket to [store new files in encrypted form](https://v3.aruna-engine.org/app/docs/v1/encrypted-buckets) with keys that stay with the people you choose.
- **AI assistants.** You can [connect AI assistants](https://v3.aruna-engine.org/app/docs/v1/assistant) through MCP so they can search and read your data under your permissions. Assistants can also propose changes as they work with your data, while every change still requires your approval.
- **Simple deployment.** Instead of managing several services, you can run a single node as one program on anything from a laptop to a Kubernetes cluster.

## Aruna V2 and Aruna V3 at a glance

The comparison below summarizes what changes for your organization when moving from Aruna V2 to **Aruna V3**.

| | Aruna V2 | Aruna V3 |
|---|---|---|
| Architecture | Traditional central server with data proxies | Peer nodes in a realm with no central server |
| Orchestration | Hooks that trigger external services | Jobs move to data or data to jobs under placement policies |
| Metadata | Rigid model with key-value labels and relations | Linked data with RO-Crate, provenance graph, SPARQL and SHACL profiles |
| Data access | S3 through data proxies | Virtual buckets over local files, copies and references to other nodes |
| Versions | Snapshots | Full history and merges with Git in the ARC layout |
| Publishing | Persistent identifiers per resource | DOI publishing to Zenodo and InvenioRDM, plus OAI-PMH and GA4GH DRS |
| Deployment | Several services | One program per node |

## Our vision for Aruna

**Aruna V3** gives your institution the foundation to make research data findable, accessible, interoperable and reusable while staying responsible for its own data. Because files and their descriptions travel together, a dataset stays understandable wherever researchers use it. Realms can also connect to one another, which lets researchers sign in to another realm with their home account and discover data across organizational borders. Through this model, we want Aruna to grow into a **network of research data infrastructures** that cooperate without giving up their independence.

## Hosting for the NFDI community continues

Our partners in the NFDI consortia **keep the hosted service** we provide today while gaining the option to run their own nodes. Organizations that rely on our hosted service can continue using it and move to **Aruna V3** at their own pace during the transition.

## Public testing status

Public testing lets you try **Aruna V3** early while its features, interfaces and data formats may still change before the stable release. Because the system is still changing, please **do not rely on it yet** for data you cannot afford to lose.

## Transition plan for Aruna V2

You can **continue using Aruna V2** for your current work while we prepare a transition phase that helps everyone move their data to **Aruna V3**. We will announce the transition separately once public testing has concluded.

- **Transition phase.** During the transition phase, you can keep using Aruna V2 while you migrate your data to **Aruna V3**.
- **Served from Aruna V3.** Later in the transition, Aruna V2 may stay available as a virtual interface while **Aruna V3** already serves all data. From then on, you will add any new data through **Aruna V3**.
- **Shutdown.** Once everyone has migrated, we will shut down Aruna V2 after a grace period and announce all dates in advance.

## Be part of the next chapter

You can try your own workflows in **Aruna V3** today by visiting [v3.aruna-engine.org](https://v3.aruna-engine.org). The [portal documentation](https://v3.aruna-engine.org/app/docs/v1) offers step-by-step guides, and [Find your way around](https://v3.aruna-engine.org/app/docs/v1/portal-tour) is a good place to start. Aruna is open source under the Apache 2.0 and MIT licenses on [GitHub](https://github.com/arunaengine/aruna), where you can also share your feedback through [GitHub issues](https://github.com/arunaengine/aruna/issues).

The Aruna Team
