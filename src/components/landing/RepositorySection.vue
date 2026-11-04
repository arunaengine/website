<script setup lang="ts">
import { Archive, Upload } from '@lucide/vue'
import mark from '@/assets/brand/favicon.png'

const ROWS = [
  ['When', 'At the end of a project', 'From the first file'],
  ['Where the data lives', 'One copy, uploaded once', 'Where it is made, at every site'],
  ['Descriptions', 'Written once, at deposit', 'Kept current and checked against profiles'],
  ['Analyses', 'Run somewhere else', 'Run next to the data, with a record'],
  ['Afterwards', 'Static archive', 'Data stays active and reusable'],
] as const
</script>

<template>
  <section id="repo" class="s25 repo">
    <div class="wrap head-c">
      <p class="eb">Where Aruna fits</p>
      <h2>Aruna is not a repository</h2>
      <p class="body"><span class="t-l">Repositories keep the final copy at the end of a project. Aruna works with your data while it is in use, from the first file to the publication.</span><span class="t-s">Repositories keep the final copy. Aruna works with the data while it is in use.</span></p>
    </div>
    <div class="wrap repo-t">
      <div class="rt-h"><span></span><span><Archive />Repository</span><span class="a"><img alt="" class="mk" :src="mark" />Aruna</span></div>
      <div v-for="[topic, repository, aruna] in ROWS" :key="topic" class="rt-r"><b>{{ topic }}</b><span>{{ repository }}</span><span class="a">{{ aruna }}</span></div>
    </div>
    <p class="repo-n"><Upload />When a dataset is ready, Aruna publishes it to public repositories, with its description.</p>
  </section>
</template>
