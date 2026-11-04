<script setup lang="ts">
import { RouterLink } from 'vue-router'
import lockup from '@/assets/brand/lockup-horizontal-white.avif'
</script>

<template>
  <footer>
    <div class="foot">
      <img alt="Aruna" :src="lockup" />
      <span>Open source under Apache 2.0 and MIT</span>
      <div class="flinks">
        <a href="https://github.com/arunaengine/aruna">GitHub</a>
        <RouterLink to="/app/docs/v1">Docs</RouterLink>
        <a href="https://v3.aruna-engine.org">NFDI realm</a>
        <a href="https://github.com/arunaengine/aruna/issues">Issues</a>
        <RouterLink to="/imprint">Imprint</RouterLink>
        <RouterLink to="/terms">Terms</RouterLink>
      </div>
    </div>
  </footer>
</template>
