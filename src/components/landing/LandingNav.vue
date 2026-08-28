<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import Button from '@/components/ui/Button.vue'
import GithubIcon from '@/components/icons/GithubIcon.vue'
import { BookOpen, ArrowRight, LogIn, Moon, Sun } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAuth } from '@/composables/useAuth'

const { isDark, toggleTheme } = useTheme()
const { isAuthenticated, signIn } = useAuth()

function onSignIn() {
  void signIn({ redirectTo: '/app' })
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
        <a href="#overview" class="transition-colors hover:text-foreground">Overview</a>
        <a href="#capabilities" class="transition-colors hover:text-foreground">What's inside</a>
      </nav>

      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="hidden sm:inline-flex" as-child>
          <a
            href="https://github.com/ArunaStorage"
            target="_blank"
            rel="noopener"
          >
            <GithubIcon class="h-4 w-4" />
            GitHub
          </a>
        </Button>
        <Button variant="ghost" size="sm" class="hidden sm:inline-flex">
          <BookOpen class="h-4 w-4" />
          Docs
        </Button>
        <Button variant="ghost" size="icon" :aria-label="isDark ? 'Use light mode' : 'Use dark mode'" @click="toggleTheme">
          <Sun v-if="isDark" class="h-4 w-4" />
          <Moon v-else class="h-4 w-4" />
        </Button>
        <Button v-if="!isAuthenticated" size="sm" @click="onSignIn">
          <LogIn class="h-3.5 w-3.5" />
          Sign in
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
