<script setup lang="ts">
import {IconPlus} from "@tabler/icons-vue";

const questions = [
  {
    q: 'What is Aruna?',
    a: 'The Aruna data orchestration engine is an open source data management platform that enables scientists and industry partners to store, annotate and share their data according to FAIR principles.',
  },
  {
    q: 'Who develops Aruna?',
    a: 'Aruna is developed by a small team at Justus-Liebig-University Giessen for the NFDI4Biodiversity and NFDI4Microbiota projects, as well as the GAIA-X connector project FAIR Data Spaces.',
  },
  {
    q: 'Why should I use Aruna for my project?',
    a: 'Storing data in localized domain specific data silos can limit collaboration, reuse, and analysis of data. The Aruna platform can bring great benefits for your research data such as improved collaboration, compliance with FAIR principles, scalability, data security, and easy integration with existing workflows.',
  },
  {
    q: 'How can I log in?',
    a: 'Currently our service is an invitation only platform for members of the NFDI consortia and other partners. In the future we plan to open our platform for a broader audience.',
  },
  {
    q: 'Is there a maximum storage capacity?',
    a: 'Storage managed by us does not have any quotas, but is limited to a small number of existing partners. There are no restrictions when hosting your own data proxy instance. The technical limit per object is 5 TB as per S3 specification.',
  },
  {
    q: 'Who can see my data?',
    a: 'You can choose how your data is shared, and we offer a variety of access models, from highly confidential data to public datasets that anyone can view and download. By default, all of your data is private and only accessible to the people you grant access to, but a minimal configurable set of metadata is always public to ensure discoverability.',
  },
  {
    q: 'Is my data secure?',
    a: 'When using our managed service, we ensure that your data is stored through our custom data proxy component, which encrypts, compresses, and anonymizes all user-provided data by default. This way, your data is always secure while stored on disk.',
  },
  {
    q: 'What is a data proxy?',
    a: 'Data proxies are the decentralized backbone of the data plane, interacting directly with data storage providers and providing a unified S3-compliant interface for data. In addition, they can be configured to perform data encryption, compression, anonymization, and end-user access control, including enforcement of data usage policies.',
  },
  {
    q: 'How many projects can I create?',
    a: 'There are no limits regarding the amount of projects to create.',
  },
]
</script>
<template>
  <section id="faq" class="section">
    <div class="container max-w-3xl">
      <div class="text-center">
        <div class="eyebrow">FAQ</div>
        <h2 class="section-title">Frequently asked questions</h2>
      </div>

      <div class="mt-10 divide-y divide-border border-y border-border">
        <details v-for="item in questions" :key="item.q" class="group">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-base font-medium text-foreground hover:text-aruna-tagline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {{ item.q }}
            <IconPlus class="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"/>
          </summary>
          <p class="pb-5 pe-8 text-sm leading-relaxed text-muted-foreground">{{ item.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>
