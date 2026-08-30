<script setup lang="ts">
import AppLogo from '@/components/layout/AppLogo.vue'
import GithubIcon from '@/components/icons/GithubIcon.vue'
import { BookOpen } from '@lucide/vue'
</script>

<template>
  <footer class="border-t border-border bg-background">
    <div class="container grid gap-8 py-10 md:grid-cols-4">
      <div class="md:col-span-2">
        <AppLogo :size="24" subtitle="the data orchestration engine" />
        <p class="mt-4 max-w-sm text-sm text-muted-foreground">
          Data management for research. Each organization runs its own node,
          keeps authority over its data and shares through the realm.
        </p>
      </div>
      <div>
        <h4
          class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Portal
        </h4>
        <ul class="mt-3 space-y-2 text-sm text-foreground/80">
          <li><a href="/app" class="hover:text-foreground">Dashboard</a></li>
          <li><a href="/app/buckets" class="hover:text-foreground">Data</a></li>
          <li><a href="/app/datasets" class="hover:text-foreground">Datasets</a></li>
          <li><a href="/app/datasets?expert=1" class="hover:text-foreground">SPARQL workbench</a></li>
          <li><a href="/app/groups" class="hover:text-foreground">Groups &amp; access</a></li>
        </ul>
      </div>
      <div>
        <h4
          class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Engine &amp; spec
        </h4>
        <ul class="mt-3 space-y-2 text-sm text-foreground/80">
          <li>
            <a href="https://github.com/ArunaStorage" class="inline-flex items-center gap-1 hover:text-foreground" target="_blank" rel="noopener">
              <GithubIcon class="h-3 w-3" /> Aruna engine (Rust)
            </a>
          </li>
          <li><a href="/app/profiles" class="hover:text-foreground">RO-Crate profiles</a></li>
          <li><a href="/app/docs/v1" class="hover:text-foreground">Documentation</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-border bg-muted/20">
      <div
        class="container flex flex-col items-start justify-between gap-3 py-5 text-xs text-muted-foreground md:flex-row md:items-center"
      >
        <div>
          © 2026 the Aruna project · Apache 2.0 and MIT licensed
        </div>
        <div class="flex items-center gap-3">
          <a
            href="https://github.com/ArunaStorage"
            target="_blank"
            rel="noopener"
            aria-label="Aruna on GitHub"
            class="hover:text-foreground"
          ><GithubIcon class="h-4 w-4" /></a>
          <a href="/app/docs/v1" aria-label="Documentation" class="hover:text-foreground"><BookOpen class="h-4 w-4" /></a>
        </div>
      </div>
    </div>
  </footer>
</template>
