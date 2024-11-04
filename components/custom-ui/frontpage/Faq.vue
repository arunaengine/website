<template>
  <!-- FAQ -->
  <div
    class="container w-full mt-12 px-2 py-10 sm:px-6 lg:px-8 lg:py-14 mx-auto border border-aruna-text/50 bg-aruna-bg/90 rounded-md">
    <!-- Title -->
    <div class="max-w-2xl mx-auto text-center mb-10 lg:mb-14">
      <h2 class="text-2xl font-bold md:text-3xl md:leading-tight text-aruna-text-accent">
        Frequently Asked Questions
      </h2>
    </div>
    <!-- End Title -->

    <div class="mx-auto">
      <!-- Grid -->
      <div class="md:columns-2 lg:columns-3 space-y-6 px-12">
        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            What is Aruna?
          </h3>
          <p class="mt-2 text-aruna-text">
            The Aruna data orchestration engine is an open source data
            management platform that enables scientists and industry partners to
            store, annotate and share their data according to FAIR principles.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            Who develops Aruna ?
          </h3>
          <p class="mt-2 text-aruna-text">
            Aruna is developed by a small team at Justus-Liebig-University
            Giessen for the NFDI4Biodiversity and NFDI4Microbiota projects, as
            well as the GAIA-X connector project FAIR Data Spaces.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            Why should i use Aruna for my project ?
          </h3>
          <p class="mt-2 text-aruna-text">
            Storing data in localized domain specific data silos can limit
            collaboration, reuse, and analysis of data. The Aruna platform can
            bring great benefits for your research data such as improved
            collaboration, compliance with FAIR principles, scalability, data
            security, and easy integration with existing workflows.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            How can I log in ?
          </h3>
          <p class="mt-2 text-aruna-text">
            Currently our service is an invitation only platform for members of
            the NFDI consortia and other partners. In the future we plan to open
            our platform for a broader audience.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            Is there a maximum storage capacity ?
          </h3>
          <p class="mt-2 text-aruna-text">
            Storaged manage by us does not have any quotas, but is limited to a
            small number of existing partners. There are no restrictions when
            hosting your own data proxy instance. The technical limit per
            objects is 5 TB as per S3 specification.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            Who can see my data ?
          </h3>
          <p class="mt-2 text-aruna-text">
            You can choose how your data is shared, and we offer a variety of
            access models, from highly confidential data to public datasets that
            anyone can view and download. By default, all of your data is
            private and only accessible to the people you grant access to, but a
            minimal configurable set of metadata is always public to ensure
            discoverability.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            Is my data secure ?
          </h3>
          <p class="mt-2 text-aruna-text">
            When using our managed service, we ensure that your data is stored
            through our custom data proxy component, which encrypts, compresses,
            and anonymizes all user-provided data by default. This way, your
            data is always secure while stored on disk.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            What is a data proxy ?
          </h3>
          <p class="mt-2 text-aruna-text">
            Data proxies are the decentralized backbone of the data plane,
            interacting directly with data storage providers and providing a
            unified S3-compliant interface for data. In addition, they can be
            configured to perform data encryption, compression, anonymization,
            and end-user access control, including enforcement of data usage
            policies.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-aruna-text-accent">
            How many projects can I create ?
          </h3>
          <p class="mt-2 text-aruna-text">
            There are no limits regarding the amount of projects to create.
          </p>
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
  </div>
  <!-- End FAQ -->
</template>