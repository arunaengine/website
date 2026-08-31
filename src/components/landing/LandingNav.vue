<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import GithubIcon from '@/components/icons/GithubIcon.vue'
import { BookOpen, ArrowRight, LogIn, Moon, Sun } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { ref } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleTheme } = useTheme()
const signingIn = ref(false)
let hasSession = false
try {
  hasSession = Boolean(window.localStorage.getItem('aruna.authToken'))
} catch {
  // Storage can be unavailable; the portal will resolve the session on entry.
}

async function onSignIn() {
  signingIn.value = true
  try {
    const { useAuth } = await import('@/composables/useAuth')
    await useAuth().signIn({ redirectTo: '/app' })
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70"
  >
    <div class="container flex h-14 items-center justify-between gap-6">
      <RouterLink to="/" class="flex items-center hover:opacity-90">
        <AppLogo :size="26" />
      </RouterLink>

      <nav
        class="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
      >
        <a href="#overview" class="whitespace-nowrap transition-colors hover:text-foreground">Overview</a>
        <a href="#capabilities" class="whitespace-nowrap transition-colors hover:text-foreground">What's inside</a>
      </nav>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" as-child>
          <a
            href="https://github.com/ArunaStorage"
            target="_blank"
            rel="noopener"
            aria-label="GitHub"
            title="GitHub"
          >
            <GithubIcon class="h-4 w-4" />
            <span class="hidden sm:inline">GitHub</span>
          </a>
        </Button>
        <Button variant="ghost" size="sm" as-child>
          <RouterLink to="/app/docs/v1" aria-label="Documentation" title="Documentation">
            <BookOpen class="h-4 w-4" />
            <span class="hidden sm:inline">Docs</span>
          </RouterLink>
        </Button>
        <Button variant="ghost" size="icon" :aria-label="isDark ? 'Use light mode' : 'Use dark mode'" @click="toggleTheme">
          <Sun v-if="isDark" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </Button>
        <Button v-if="!hasSession" size="sm" :disabled="signingIn" :aria-busy="signingIn" @click="onSignIn">
          <LogIn class="h-3.5 w-3.5" />
          {{ signingIn ? 'Opening…' : 'Sign in' }}
        </Button>
        <Button v-else size="sm" as-child>
          <RouterLink to="/app">
            Open portal
            <ArrowRight class="h-3.5 w-3.5" />
          </RouterLink>
        </Button>
      </div>
    </div>
  </header>
</template>
