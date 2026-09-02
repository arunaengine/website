<script setup lang="ts">
// Placeholder for the profile tutorial. The route exists already so the docs
// and the welcome card can point at it while the walkthrough is being built.
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { ArrowRight, ListChecks } from '@lucide/vue'
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Tutorial"
      title="Build a profile"
      description="A guided pass over the profile builder, on a practice profile."
    />
    <div class="container py-8">
      <EmptyState
        title="This tutorial is coming next"
        description="The interactive walkthrough of the profile builder is not ready yet. The builder itself is, and the guide explains every step it takes."
      >
        <template #icon><ListChecks class="h-7 w-7" /></template>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" as-child>
            <RouterLink :to="{ name: 'profile-new' }">Open the profile builder <ArrowRight class="h-4 w-4" /></RouterLink>
          </Button>
          <Button variant="outline" size="sm" as-child>
            <RouterLink :to="{ name: 'docs', params: { topic: 'build-a-profile' } }">Read the guide</RouterLink>
          </Button>
        </div>
      </EmptyState>
    </div>
  </div>
</template>
