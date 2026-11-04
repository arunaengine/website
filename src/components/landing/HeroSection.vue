<script setup lang="ts">
import { RouterLink } from 'vue-router'
import HeroMap from './HeroMap.vue'

const STANDARDS = ['S3', 'RO-Crate', 'ARC', 'RDF', 'SPARQL', 'GA4GH TES', 'GA4GH DRS', 'OIDC', 'OAI-PMH', 'Git', 'Jupyter', 'MCP']
</script>

<template>
  <section id="top" class="hero h25">
    <div class="h25-copy">
      <h1><span class="l1">Connect your silos</span><span class="l2">Don’t build a bigger one</span></h1>
      <p class="sub">
        <span class="t-l"><span>One S3 bucket across every lab, core facility and cloud.</span> <span>Every dataset keeps its metadata, provenance and access rules.</span></span><span class="t-s">One S3 bucket across all your sites, with metadata, provenance and access rules.</span>
      </p>
      <div class="cta"><RouterLink class="primary" to="/app/datasets">Explore a dataset</RouterLink><a class="sec" href="#start">Run your own</a></div>
    </div>
    <div class="h25-vis"><HeroMap /></div>
    <div class="h25-std">
      <span>Built on open standards</span>
      <ul>
        <li v-for="standard in STANDARDS" :key="standard">{{ standard }}</li>
      </ul>
    </div>
  </section>
</template>
