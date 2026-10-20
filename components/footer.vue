<script setup lang="ts">
import {IconArrowUpRight, IconBrandGithub} from "@tabler/icons-vue";
</script>
<template>
  <footer class="w-full mt-auto border-t border-border bg-background">
    <div class="max-w-[85rem] mx-auto px-4 lg:px-8 py-10 grid gap-8 md:grid-cols-4">
      <div class="md:col-span-2">
        <img src="/brand/lockup-horizontal-white.avif" alt="Aruna logo" class="h-7 w-auto"/>
        <p class="tagline mt-3 text-xs">the data orchestration engine</p>
        <p class="mt-4 max-w-sm text-sm text-muted-foreground">
          Store, annotate and share research data according to the FAIR principles.
        </p>
      </div>
      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aruna</h4>
        <ul class="mt-3 space-y-2 text-sm text-foreground/80">
          <li><NuxtLink to="/explore" class="hover:text-foreground">Search</NuxtLink></li>
          <li><NuxtLink to="/news" class="hover:text-foreground">News</NuxtLink></li>
          <li>
            <a href="https://docs.aruna-engine.org/latest" target="_blank" rel="noopener" class="hover:text-foreground">
              Documentation
            </a>
          </li>
          <li>
            <a href="https://v3.aruna-engine.org" target="_blank" rel="noopener"
               class="inline-flex items-center gap-1 text-aruna-aqua hover:text-foreground">
              Aruna v3 <IconArrowUpRight class="size-3.5"/>
            </a>
          </li>
        </ul>
      </div>
      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</h4>
        <ul class="mt-3 space-y-2 text-sm text-foreground/80">
          <li><NuxtLink to="/about" class="hover:text-foreground">About</NuxtLink></li>
          <li><NuxtLink to="/imprint" class="hover:text-foreground">Imprint</NuxtLink></li>
          <li><NuxtLink to="/tos" class="hover:text-foreground">Terms of Service</NuxtLink></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-border bg-muted/20">
      <div class="max-w-[85rem] mx-auto px-4 lg:px-8 py-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>&copy; {{ new Date().getFullYear() }} the Aruna project</div>
        <a href="https://github.com/arunaengine" target="_blank" rel="noopener" aria-label="Aruna on GitHub"
           class="hover:text-foreground">
          <IconBrandGithub class="size-4"/>
        </a>
      </div>
    </div>
  </footer>
</template>
