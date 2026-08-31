<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { BookOpen, ChevronLeft, FileText, ListChecks, Play } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { startTour } from '@/composables/useTour'
import {
  docsScreenshots,
  docsTopicBySlug,
  docsTopics,
  docsVersion,
  type DocsTopicKind,
} from '@/docs/v1'

const route = useRoute()

const topicSlug = computed(() => {
  const value = route.params.topic
  return Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : ''
})
const topic = computed(() => docsTopicBySlug(topicSlug.value))
const tour = computed(() => topic.value?.tour ?? [])
const topicGroups = computed(() => {
  const groups: Array<{ kind: DocsTopicKind; topics: typeof docsTopics }> = [
    { kind: 'Concept', topics: docsTopics.filter((entry) => entry.kind === 'Concept') },
    { kind: 'Guide', topics: docsTopics.filter((entry) => entry.kind === 'Guide') },
  ]
  return groups
})
</script>

<template>
  <div>
    <PageHeader
      :title="topic?.title ?? `Docs ${docsVersion}`"
      :description="topic?.summary ?? 'Versioned guidance for portal concepts, scopes, states, and common workflows.'"
    >
      <template #breadcrumbs>
        <span>·</span>
        <Badge variant="outline">{{ docsVersion }}</Badge>
        <template v-if="topic">
          <span>·</span>
          <Badge variant="secondary">{{ topic.kind }}</Badge>
        </template>
      </template>
      <template v-if="topic" #actions>
        <Button variant="outline" as-child>
          <RouterLink :to="{ name: 'docs' }"><ChevronLeft class="h-4 w-4" /> All topics</RouterLink>
        </Button>
      </template>
    </PageHeader>

    <!-- A guide with a tour walks the reader through the real controls. -->
    <div v-if="tour.length" class="container pt-6">
      <Button size="lg" @click="startTour(tour)">
        <Play class="h-4 w-4" /> Show me in the portal
      </Button>
      <p class="mt-1.5 text-xs text-muted-foreground">
        {{ tour.length }} steps, highlighted in the portal itself. Esc ends the tour.
      </p>
    </div>

    <div class="container py-8">
      <div class="grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav class="surface h-fit p-3" aria-label="Docs topics">
          <RouterLink
            :to="{ name: 'docs' }"
            class="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
            :class="!topicSlug ? 'bg-primary/10 text-primary' : 'text-foreground'"
          >
            <BookOpen class="h-4 w-4" /> Docs home
          </RouterLink>
          <div v-for="group in topicGroups" :key="group.kind" class="mt-4">
            <h2 class="px-2.5 font-display text-sm font-semibold text-aruna-navy">
              {{ group.kind === 'Concept' ? 'Concepts' : 'How-to guides' }}
            </h2>
            <ul class="mt-1 space-y-0.5">
              <li v-for="entry in group.topics" :key="entry.slug">
                <RouterLink
                  :to="{ name: 'docs', params: { topic: entry.slug } }"
                  class="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
                  :class="topicSlug === entry.slug ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
                  :aria-current="topicSlug === entry.slug ? 'page' : undefined"
                >
                  <ListChecks v-if="entry.kind === 'Guide'" class="h-3.5 w-3.5 shrink-0" />
                  <FileText v-else class="h-3.5 w-3.5 shrink-0" />
                  <span>{{ entry.title }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>
        </nav>

        <main class="min-w-0">
          <template v-if="topic">
            <article class="surface overflow-hidden">
              <section
                v-for="(section, sectionIndex) in topic.sections"
                :key="section.title"
                class="px-5 py-5 sm:px-7"
                :class="sectionIndex ? 'border-t border-border' : ''"
              >
                <h2 class="font-display text-lg font-semibold text-aruna-navy">{{ section.title }}</h2>
                <div v-if="section.paragraphs" class="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
                  <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
                </div>
                <ul v-if="section.bullets" class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
                  <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
                </ul>
                <ol v-if="section.steps" class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/85">
                  <li v-for="step in section.steps" :key="step">{{ step }}</li>
                </ol>
                <figure v-if="section.image" class="mt-4">
                  <img
                    :src="section.image.src"
                    :alt="section.image.alt"
                    loading="lazy"
                    class="w-full rounded-md border border-border"
                  />
                  <figcaption v-if="section.image.caption" class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {{ section.image.caption }}
                  </figcaption>
                </figure>
              </section>
            </article>
          </template>

          <EmptyState
            v-else-if="topicSlug"
            title="Docs topic not found"
            description="This topic is not part of the current versioned guide."
          >
            <Button variant="outline" as-child><RouterLink :to="{ name: 'docs' }">Browse Docs</RouterLink></Button>
          </EmptyState>

          <template v-else>
            <div class="grid gap-4 sm:grid-cols-2">
              <section v-for="group in topicGroups" :key="group.kind" class="surface p-5">
                <div class="flex items-center gap-2">
                  <ListChecks v-if="group.kind === 'Guide'" class="h-4 w-4 text-primary" />
                  <FileText v-else class="h-4 w-4 text-primary" />
                  <h2 class="font-display text-base font-semibold text-aruna-navy">
                    {{ group.kind === 'Concept' ? 'Concepts' : 'How-to guides' }}
                  </h2>
                </div>
                <ul class="mt-3 space-y-2">
                  <li v-for="entry in group.topics" :key="entry.slug">
                    <RouterLink
                      :to="{ name: 'docs', params: { topic: entry.slug } }"
                      class="block rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted"
                    >
                      <span class="block text-sm font-medium text-foreground">{{ entry.title }}</span>
                      <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{{ entry.summary }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </section>
            </div>

            <aside class="mt-6 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <span class="font-medium text-foreground">Screenshot status:</span>
              {{ docsScreenshots.note }}
            </aside>
          </template>
        </main>
      </div>
    </div>
  </div>
</template>
