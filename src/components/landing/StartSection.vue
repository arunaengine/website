<script setup lang="ts">
import { GitBranch, Globe, Network, Terminal } from '@lucide/vue'
</script>

<template>
  <section id="start" class="closing">
    <div class="wrap head-c">
      <p class="eb">Get started</p>
      <h2>Join our NFDI realm or run your own</h2>
    </div>
    <div class="wrap who">
      <div>
        <span class="bi"><Globe /></span><b>Join the NFDI community</b>
        <p>Use the NFDI realm of the German National Research Data Infrastructure. Start with your own group, storage and datasets.</p>
        <a class="primary" href="https://v3.aruna-engine.org/app">Join the NFDI realm</a>
      </div>
      <div>
        <span class="bi"><Network /></span><b>Build your own realm</b>
        <p>Run Aruna on your own nodes, with your own storage and sign-in. Connect to other realms whenever you want to share.</p>
        <a class="primary" href="https://github.com/arunaengine/aruna#run-with-docker-single-node">Run your own</a>
      </div>
    </div>
    <div class="wrap tail25">
      <a class="tl" href="https://github.com/arunaengine/aruna"><GitBranch />View the source on GitHub</a>
      <a class="tl" href="https://github.com/arunaengine/aruna#small-local-realm"><Terminal />Try it on your own computer</a>
    </div>
  </section>
</template>
