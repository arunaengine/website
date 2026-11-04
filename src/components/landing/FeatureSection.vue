<script setup lang="ts">
import { Bot, FileArchive, GitBranch, KeyRound, Laptop, ListChecks, Lock, NotebookPen, Quote, ShieldCheck } from '@lucide/vue'

const FEATURES = [
  { icon: GitBranch, title: 'Git for datasets', text: 'Each dataset is a Git repository, optionally in the ARC layout. Clone, branch and push.' },
  { icon: Quote, title: 'Publish with a DOI', text: 'Publish to public repositories and get a DOI.' },
  { icon: NotebookPen, title: 'Notebooks', text: 'Run Jupyter notebooks in the portal, next to your data.' },
  { icon: Bot, title: 'AI assistants', text: 'Built into the portal. Your own assistants connect through MCP and work with your permissions.' },
  { icon: ListChecks, title: 'Metadata checks', text: 'Profiles list the details a dataset needs. Aruna shows what is missing.' },
  { icon: ShieldCheck, title: 'Safe transfers', text: 'Files are checked when stored and copied, so corruption shows early.' },
  { icon: KeyRound, title: 'Single sign-on', text: "Use your organization's OIDC provider. Groups and roles control access." },
  { icon: Lock, title: 'Encrypted buckets', text: 'Keys stay with the people you choose. A share never unlocks them.' },
  { icon: FileArchive, title: 'Compression', text: 'Files are stored compressed and read back unchanged.' },
  { icon: Laptop, title: 'CLI and desktop app', text: 'Work from the terminal or a desktop app, with the same access as in the portal.' },
]
</script>

<template>
  <section id="more" class="s25">
    <div class="wrap more26">
      <div class="head-l">
        <p class="eb">Features</p>
        <h2>Built into every node</h2>
        <p class="body">The same features on every node, whether you join the NFDI realm or run your own.</p>
      </div>
      <div class="feats">
        <div v-for="feature in FEATURES" :key="feature.title"><component :is="feature.icon" /><b>{{ feature.title }}</b><p>{{ feature.text }}</p></div>
      </div>
    </div>
  </section>
</template>
