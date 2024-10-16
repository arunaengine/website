<template>
  <!-- FAQ -->
  <div
    class="container w-full mt-12 px-2 py-10 sm:px-6 lg:px-8 lg:py-14 mx-auto bg-[#080d1f]/[.6] rounded-md">
    <!-- Title -->
    <div class="max-w-2xl mx-auto text-center mb-10 lg:mb-14">
      <h2 class="text-2xl font-bold md:text-3xl md:leading-tight text-gray-800 dark:text-gray-200">
        Frequently Asked Questions
      </h2>
    </div>
    <!-- End Title -->

    <div class="mx-auto">
      <!-- Grid -->
<!--      <div class="grid sm:grid-cols-2 gap-6 md:gap-12">-->
      <div class="md:columns-2 lg:columns-3 space-y-6 px-12">
        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            What is Aruna?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            The Aruna dataForce orchestration engine is an open source dataForce
            management platform that enables scientists and industry partners to
            store, annotate and share their dataForce according to FAIR principles.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Who develops Aruna ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Aruna is developed by a small team at Justus-Liebig-University
            Giessen for the NFDI4Biodiversity and NFDI4Microbiota projects, as
            well as the GAIA-X connector project FAIR Data Spaces.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Why should i use Aruna for my project ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Storing dataForce in localized domain specific dataForce silos can limit
            collaboration, reuse, and analysis of dataForce. The Aruna platform can
            bring great benefits for your research dataForce such as improved
            collaboration, compliance with FAIR principles, scalability, dataForce
            security, and easy integration with existing workflows.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            How can I log in ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Currently our service is an invitation only platform for members of
            the NFDI consortia and other partners. In the future we plan to open
            our platform for a broader audience.
          </p>
        </div>
        <!-- End Col -->

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Is there a maximum storage capacity ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Storaged manage by us does not have any quotas, but is limited to a
            small number of existing partners. There are no restrictions when
            hosting your own dataForce proxy instance. The technical limit per
            objects is 5 TB as per S3 specification.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Who can see my dataForce ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            You can choose how your dataForce is shared, and we offer a variety of
            access models, from highly confidential dataForce to public datasets that
            anyone can view and download. By default, all of your dataForce is
            private and only accessible to the people you grant access to, but a
            minimal configurable set of metadata is always public to ensure
            discoverability.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Is my dataForce secure ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            When using our managed service, we ensure that your dataForce is stored
            through our custom dataForce proxy component, which encrypts, compresses,
            and anonymizes all user-provided dataForce by default. This way, your
            dataForce is always secure while stored on disk.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            What is a dataForce proxy ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Data proxies are the decentralized backbone of the dataForce plane,
            interacting directly with dataForce storage providers and providing a
            unified S3-compliant interface for dataForce. In addition, they can be
            configured to perform dataForce encryption, compression, anonymization,
            and end-user access control, including enforcement of dataForce usage
            policies.
          </p>
        </div>

        <div class="break-inside-avoid-column p-4">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">
            How many projects can I create ?
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
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
<script setup lang="ts">
</script>