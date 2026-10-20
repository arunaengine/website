## Our Results from BioHackathon Germany 2025

Managing large-scale life science data in federated storage systems is challenging. While Research Object Crates (RO-Crate) provide a standardized way to package data with metadata, existing tools struggle with extremely large datasets and distributed storage environments. At BioHackathon Germany 2025, these problems were tackled head-on within our project:

**_"Enhancing FAIR (Meta-)Data Practices in Life Science by Improving RO-Crates Support in Federated Storage Systems"_**

## **Key Discussions**

Our work centered on practical challenges that researchers face daily. We explored how to handle nested subcrates with sophisticated references to create and resolve hierarchical structures. We also addressed the complexities of merging independent RO-Crates ensuring unique identifiers, handling conflicting property values, and maintaining valid JSON-LD structures. Another focus area was integrating checksum properties from the SPDX vocabulary directly into entity metadata to improve content consistency validation. These discussions shaped our technical development throughout the week.

## **Results**

Five days of hacking with a team of seven people produced some concrete improvements to the RO-Crate ecosystem. The atmosphere throughout was motivated and productive, allowing us to make significant progress across multiple of the tasks defined by the project:

### **Library Extensions**

We extended both [**ro-crate-py**](https://github.com/ResearchObject/ro-crate-py) and [**ro-crate-rs**](https://github.com/intbio-ncl/ro-crate-rs) with better support for subcrate handling. The added implementations allow lazy loading of nested crates, so you only load metadata when you actually need it, which is crucial for handling large hierarchies efficiently.

### **Interactive CLI Tool**

We built a [**terminal user interface**](https://github.com/arunaengine/ro-crate-tui) for exploring RO-Crates, supporting both attached and detached formats. You can navigate through nested crates using familiar commands like `ls`, `cd`, and `get`, making it easy to inspect complex research objects directly from the terminal. This is based directly on the [**ro-crate-rs**](https://github.com/intbio-ncl/ro-crate-rs) library.

![Screenshot of the terminal user interface which displays the properties of the root dataset entity](/blog/making-research-data-more-fair/tui-screenshot.webp)

### **RO-Crate Merger**

Another tool/library produced by the project is the [**RO-Crate Merger**](https://github.com/arunaengine/rocrate-merger), which tackles the complex issue of merging nested or independent RO-Crates while maintaining valid JSON-LD structures. This tool enables you to consolidate nested subcrates into a single metadata file or merge independent RO-Crates while automatically tracking the provenance of each merged entity.

### **RO-Crate Indexer**

We created a [**web service / CLI Tool**](https://github.com/arunaengine/rocrate-indexer) that ingests RO-Crates and provides full-text search across all entities. Whether you're doing fuzzy searches or looking for specific entity types, the indexer makes finding information in large crates much faster and user friendly.

![  Screenshot of the executed  Screenshot which displays the result of the /search endpoint after searching for the query Maria.](/blog/making-research-data-more-fair/rocrate-indexer.webp)

### **RO-Crate Explorer**

Our [**browser-based demonstrator**](https://github.com/arunaengine/ro-crate-explorer) (🌐 [Demo](https://arunaengine.github.io/ro-crate-explorer/)) lets users upload, navigate, and inspect RO-Crates through an intuitive interface. It handles ZIP archives, remote URLs, and raw JSON files, providing file tree views, entity inspection, a full text search via the integrated [**RO-Crate Indexer**](https://github.com/arunaengine/rocrate-indexer) and a convenient breadcrumb history of your current position in the hierarchy.

![Screenshot of the demonstrator displaying the properties of a subcrate.](/blog/making-research-data-more-fair/rocrate-explorer.webp)
_Screenshot of the demonstrator displaying the properties of a subcrate._

## **Looking Forward**

These developments address the need for consistently handling large amounts of distributed research data while ensuring that rich metadata is maintained. The improvements the results provide will benefit scientific communities and researchers across diverse disciplines that already use, or are planning to adopt, RO-Crate. The enriching discussions and networking with fellow participants played a big role in driving the progress of this project and we're grateful to the BioHackathon Germany organizers for creating the space where this collaboration could happen.

**The tools are open source and ready for community testing. Try them out and let us know what you think!**

![Group photo of all on-site participants at the BioHackathon Germany 2025. Photo taken by Daniel Wibberg.](/blog/making-research-data-more-fair/group-photo.webp)
_Group photo of all on-site participants at the BioHackathon Germany 2025. Photo taken by Daniel Wibberg._
