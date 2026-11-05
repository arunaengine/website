<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { BookOpen, Menu, Moon, Sun } from '@lucide/vue'
import GithubIcon from '@/components/icons/GithubIcon.vue'
import { useTheme } from '@/composables/useTheme'
import lockup from '@/assets/brand/lockup-horizontal-white.avif'

// The landing page stays dark; the button switches the theme of the portal behind it.
const { isDark, toggleTheme } = useTheme()
const menuOpen = ref(false)

function closeMenu(event: MouseEvent) {
  if ((event.target as Element).closest('a')) menuOpen.value = false
}

let hasSession = false
try {
  // Tokens are stored per realm and API origin as `aruna.authToken:<realm>@<origin>`.
  hasSession = Object.keys(window.localStorage).some((key) => key.startsWith('aruna.authToken:'))
} catch {
  // Storage can be unavailable; the portal will resolve the session on entry.
}

async function onSignIn() {
  const { useAuth } = await import('@/composables/useAuth')
  await useAuth().requestSignIn({ redirectTo: '/app' })
}
</script>

<template>
  <header class="lnav">
    <div class="container lnav-in">
      <a class="logo" href="#top"><img alt="Aruna" height="26" :src="lockup" /></a>
      <nav aria-label="Sections" class="lnav-mid">
        <a href="#top">Overview</a>
        <a href="#why">Why Aruna</a>
        <a href="#what">What it does</a>
        <a href="#portal">Portal</a>
        <RouterLink to="/news">News</RouterLink>
      </nav>
      <div class="lnav-end">
        <a
          aria-label="GitHub"
          class="btn ghost sm"
          href="https://github.com/arunaengine/aruna"
          rel="noopener"
          target="_blank"
          title="GitHub"
        >
          <GithubIcon />
          <span class="lbl">GitHub</span>
        </a>
        <RouterLink aria-label="Documentation" class="btn ghost sm" to="/app/docs/v1" title="Documentation">
          <BookOpen class="lc" />
          <span class="lbl">Docs</span>
        </RouterLink>
        <button
          id="theme"
          :aria-label="isDark ? 'Use light mode' : 'Use dark mode'"
          class="btn ghost icon"
          type="button"
          @click="toggleTheme"
        >
          <Sun v-if="isDark" class="lc" />
          <Moon v-else class="lc" />
        </button>
        <RouterLink v-if="hasSession" class="btn sec sm" to="/app">Sign in</RouterLink>
        <button v-else class="btn sec sm" type="button" @click="onSignIn">Sign in</button>
        <button
          :aria-expanded="menuOpen"
          aria-controls="mnav"
          aria-label="Sections"
          class="btn ghost icon menu"
          type="button"
          @click="menuOpen = !menuOpen"
        >
          <Menu class="lc" />
        </button>
      </div>
    </div>
    <div id="mnav" class="mnav" :hidden="!menuOpen" @click="closeMenu">
      <a href="#top">Overview</a>
      <a href="#what">What it does</a>
      <a href="#start">Run your own</a>
      <RouterLink to="/news">News</RouterLink>
      <a href="https://github.com/arunaengine/aruna">GitHub</a>
      <RouterLink to="/app/docs/v1">Docs</RouterLink>
    </div>
  </header>
</template>
