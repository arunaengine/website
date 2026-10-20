## Introducing Aruna Version 2.0 🎉

_We are thrilled to announce the full release of Aruna version 2.0, a major upgrade that marks a significant milestone in our ongoing efforts to build a flexible, domain-agnostic data management solution. This release introduces many long-awaited features, enhanced performance, and a dramatically improved user experience, and represents the first step in building a FAIR- and souvereign **data orchestration engine** for the scientific community and beyond._

_Version 2.0 incorporates valuable feedback from many users in our community and incorporates the latest advances in technology._

## Feature Highlights:

- **Geo-redundant Replication:** We have established a second data storage location at the de.NBI site in Bielefeld. To take advantage of this, we upgraded the system to allow users to configure automated replication of their data to multiple locations. This greatly improves data availability and resiliency, and enables locality aware processing of data without the need for time-consuming data transfers.

- **Upgraded Proxies:** Our data proxy components have undergone a major overhaul and are now completely decoupled from our server infrastructure, allowing partners to deploy their own on-premises proxies. This includes a configurable storage backend and a first iteration of our new rules engine to enforce location-specific policies and rules.

- **Rule Engine:** We have integrated a sophisticated rule engine based on the Common Expression Language (CEL) that allows users to define custom rules and policies for projects and self-deployed data proxies. This enables you to create your own domain-specific set of rules that are automatically enforced, promoting the vision of a diverse and domain-agnostic data management platform.

- **Hooks:** Hooks provide a powerful way to automate workflows by triggering actions in response to specific events within Aruna. There are two types of hooks, external and internal, which have slightly different use cases. External hooks address an external service that can use the passed information to perform formatting, validation, processing... tasks and return a result and/or upload the result data itself. Internal hooks are responsible for automatically binding specific labels/hooks to resources and/or creating relationships. In other words, internal hooks can be used to automate certain internal Aruna processes.

- **Service Accounts:** Aruna now offers the ability to create service accounts that can be used impersonally, e.g. by a service that communicates with Aruna via the API. Service accounts can be managed by anyone with sufficient permissions to the underlying resource(s), ensuring continuity and preventing service disruptions in the event of staff turnover.

- **Workspaces:** Workspaces are a special class of projects that can be used to provide unregistered users with an anonymous, encapsulated and time-limited working environment in Aruna. When a workspace is created, an internal service account is automatically created with limited permissions to manage objects associated with the workspace. When a user decides to register in Aruna, he/she can claim the workspace and associate it with his/her user just like a normal project.

- **Streamlined API:** As part of our ongoing efforts to improve usability, the API has been significantly streamlined, improving performance by reducing latency and processing time, and simplifying development and maintenance by reducing the likelihood of errors.

- **And many more to discover!**

_Stay tuned for a series of introductory articles in our news section that will delve deeper into Aruna's features, paired with practical use cases. These articles are designed to give you a clear understanding of how Aruna can be used as a tool to optimize your data management workflows and increase your overall efficiency._

## See Version 2.0 in Action

---

Aruna is freely available for all scientific partners. If you haven't done so, head over to the [**login page**](/auth/login) to register your account and start exploring the latest features of Aruna and the available data sets.  

### Local setup

We received many requests from people that want to create their own local setup for testing. Now you can bootstrap your own local deployment of Aruna by running a simple command:

```bash
curl -L https://demo.aruna-storage.org | docker compose -f - up
```

_Please be aware that this needs docker/podman and docker-compose/podman-compose to be installed on your system._

**Caution:** For ease of use, this deployment contains hard-coded credentials and configurations and is NOT production-ready. Contact us if you need assistance deploying a production-ready instance.

### What's next ?

Aruna version 2.0 marks a significant milestone in building a sophisticated data- and compute-aware orchestration platform for FAIR data management, but our journey is far from over. We have identified three key areas for future improvements:

- **Interoperability:** A focus for future developments will be the overall interoperability with national and international standards. A (bio)schema representation for object landing pages is planned, improving search engine compatibility and increasing interoperability with semantic services. In addition, a deeper integration of Gaia-X compliant policy and catalog services is being developed, including ODRL as a policy language and a DCAT compliant data catalog.

- **User Experience:** Many of Aruna's existing features are still not fully accessible to non-technical people. We will try to improve this by providing better visualizations and simpler representations to illustrate our features. We will also continue to improve the API to make it easier to create compelling visualizations while maintaining full compatibility with the current 2.0 API version. 

- **Technical improvements:** We will continue to improve the overall performance of the system, with the goal of providing an architecture that can handle very large numbers and sizes of objects. In addition, we plan to significantly improve the integration of existing and new compute infrastructures to efficiently support data-to-compute and compute-to-data scenarios.

## More information

---

[**Subscribe to our mailing list**](/#mailing-list) and we'll keep you in the loop with all the latest innovations, exclusive insights, and exciting updates.

The full changelog can be viewed in the [**release notes of the main Aruna repository**](https://github.com/ArunaStorage/aruna/releases/tag/v2.0.0).

Your feedback is very important for us! If you have any questions or encounter any issues, please visit our [**documentation**](https://arunastorage.github.io/documentation/latest) or contact our support team at our support email address: [**support@aruna-storage.org**](mailto:support@aruna-storage.org). Thank you for being a part of our community. We are committed to ongoing enhancements and developments of our software and evolve our software with your input.

Kind regards,  
**_The Aruna Team_**
