<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import WhereDataLivesFigure from '@/components/docs/WhereDataLivesFigure.vue'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BookMarked,
  BookOpen,
  Bot,
  Box,
  Braces,
  ChevronLeft,
  CircleCheck,
  CirclePlus,
  Clock,
  Compass,
  Copy,
  Database,
  Eraser,
  Eye,
  File,
  FileJson,
  FileText,
  Files,
  Fingerprint,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Hash,
  History,
  IdCard,
  Import,
  KeyRound,
  LayoutDashboard,
  Link2,
  ListChecks,
  MapPin,
  Package,
  PanelLeft,
  PencilLine,
  Play,
  Plug,
  RefreshCw,
  Rocket,
  Route,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Split,
  SquareTerminal,
  Tag,
  Tags,
  Trash2,
  Upload,
  Users,
  Waypoints,
  Wrench,
} from '@lucide/vue'
import { computed, defineComponent, h, type Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { startTour } from '@/composables/useTour'
import { parseInline } from '@/docs/inline'
import {
  docsScreenshots,
  docsTopicBySlug,
  docsTopics,
  docsVersion,
  sectionId,
  type DocsFigure,
  type DocsTopicKind,
} from '@/docs/v1'

/** Inline figures a section image may name instead of a file. */
const docsFigures: Record<DocsFigure, Component> = {
  'where-data-lives': WhereDataLivesFigure,
}

// Renders docs copy with its inline links as real vnodes; never raw HTML.
const inlineLinkClass =
  'font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary'
const DocsInline = defineComponent({
  props: { text: { type: String, required: true } },
  setup(props) {
    return () =>
      parseInline(props.text).map((segment, index) => {
        if ('to' in segment)
          return h(RouterLink, { key: index, to: segment.to, class: inlineLinkClass }, () => segment.label)
        if ('href' in segment)
          return h(
            'a',
            { key: index, href: segment.href, target: '_blank', rel: 'noopener noreferrer', class: inlineLinkClass },
            segment.label,
          )
        return segment.text
      })
  },
})

/** Every icon name docs sections may declare; unknown names fall back. */
const sectionIcons: Record<string, Component> = {
  Activity,
  BadgeCheck,
  Bot,
  Box,
  Braces,
  CircleCheck,
  CirclePlus,
  Clock,
  Copy,
  Database,
  Eraser,
  Eye,
  File,
  FileJson,
  FileText,
  Files,
  Fingerprint,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Hash,
  History,
  IdCard,
  Import,
  KeyRound,
  LayoutDashboard,
  Link2,
  ListChecks,
  MapPin,
  Package,
  PanelLeft,
  PencilLine,
  Play,
  Plug,
  RefreshCw,
  Rocket,
  Route,
  Scale,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Split,
  SquareTerminal,
  Tag,
  Tags,
  Trash2,
  Upload,
  Users,
  Waypoints,
  Wrench,
}

function sectionIcon(name?: string): Component {
  return (name && sectionIcons[name]) || FileText
}

const route = useRoute()

const topicSlug = computed(() => {
  const value = route.params.topic
  return Array.isArray(value) ? value[0] ?? '' : typeof value === 'string' ? value : ''
})
const topic = computed(() => docsTopicBySlug(topicSlug.value))
const tour = computed(() => topic.value?.tour ?? [])
const topicGroups = computed(() => {
  // Guides lead: they are the way in. The concept wiki sits below them.
  const groups: Array<{ kind: DocsTopicKind; label: string; blurb: string; topics: typeof docsTopics }> = [
    {
      kind: 'Guide',
      label: 'How-to guides',
      blurb: 'Step-by-step walkthroughs: create a group, upload data, build a dataset, and run compute next to it.',
      topics: docsTopics.filter((entry) => entry.kind === 'Guide'),
    },
    {
      kind: 'Concept',
      label: 'Concepts & glossary',
      blurb: 'How datasets, storage, replication, and compute placement work, with a glossary that defines every term.',
      topics: docsTopics.filter((entry) => entry.kind === 'Concept'),
    },
  ]
  return groups
})

// The home diagram's nodes deep-link into the glossary entry for each term.
function glossaryLink(anchor: string) {
  return { name: 'docs', params: { topic: 'glossary' }, hash: `#${anchor}` }
}
</script>

<template>
  <div>
    <PageHeader
      :title="topic?.title ?? `Docs ${docsVersion}`"
      :description="topic?.summary ?? 'Guides for the common workflows and a wiki for every term the portal uses.'"
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

    <!-- These pages document the portal; the node's REST surface has its own reference. -->
    <div class="container pt-6">
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground"
      >
        <BookOpen class="h-3.5 w-3.5 shrink-0 text-primary" />
        <p class="min-w-0 flex-1">
          <span class="font-medium text-foreground">This is the portal documentation.</span>
          The node also serves a full REST API reference for every endpoint.
        </p>
        <RouterLink
          :to="{ name: 'api-reference' }"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open the API reference <ArrowRight class="h-3 w-3" />
        </RouterLink>
      </div>
    </div>

    <!-- A guide with a tour walks the reader through the real controls. -->
    <div v-if="tour.length" class="container pt-4">
      <div
        class="flex flex-wrap items-center gap-4 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/[0.04] to-transparent px-4 py-3.5"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
          <Play class="h-4 w-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-sm font-semibold text-aruna-navy">Guided tour</p>
          <p class="text-xs text-muted-foreground">
            {{ tour.length }} steps, highlighted on the real controls. Esc ends the tour.
          </p>
        </div>
        <Button @click="startTour(tour)"><Play class="h-4 w-4" /> Show me in the portal</Button>
      </div>
    </div>

    <div class="container py-6">
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
            <h2 class="px-2.5 font-display text-sm font-semibold text-aruna-navy">{{ group.label }}</h2>
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
          <!-- The API reference is a reference surface, not a docs topic. -->
          <div class="mt-4 border-t border-border pt-3">
            <h2 class="px-2.5 font-display text-sm font-semibold text-aruna-navy">Reference</h2>
            <RouterLink
              :to="{ name: 'api-reference' }"
              class="mt-1 flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Braces class="h-3.5 w-3.5 shrink-0" /> <span>REST API</span>
            </RouterLink>
          </div>
        </nav>

        <main class="min-w-0">
          <template v-if="topic">
            <article class="surface overflow-hidden">
              <section
                v-for="(section, sectionIndex) in topic.sections"
                :id="sectionId(section.title)"
                :key="section.title"
                class="group/section px-5 py-5 sm:px-7"
                :class="sectionIndex ? 'border-t border-border' : ''"
              >
                <h2 class="flex items-center gap-2.5 font-display text-lg font-semibold text-aruna-navy">
                  <span class="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <component :is="sectionIcon(section.icon)" class="h-4 w-4" />
                  </span>
                  <span class="min-w-0">{{ section.title }}</span>
                  <RouterLink
                    :to="{ name: 'docs', params: { topic: topic.slug }, hash: `#${sectionId(section.title)}` }"
                    class="font-sans text-base font-normal text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover/section:opacity-100"
                    aria-label="Link to this section"
                    >#</RouterLink
                  >
                </h2>
                <div v-if="section.paragraphs" class="mt-3 max-w-prose space-y-3 text-sm leading-relaxed text-foreground/85">
                  <p v-for="paragraph in section.paragraphs" :key="paragraph"><DocsInline :text="paragraph" /></p>
                </div>
                <ul v-if="section.bullets" class="mt-3 max-w-prose list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/85 marker:text-primary/60">
                  <li v-for="bullet in section.bullets" :key="bullet"><DocsInline :text="bullet" /></li>
                </ul>
                <ol v-if="section.steps" class="mt-3 max-w-prose space-y-2 text-sm leading-relaxed text-foreground/85">
                  <li v-for="(step, stepIndex) in section.steps" :key="step" class="flex items-start gap-3">
                    <span
                      class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-semibold tabular-nums text-primary"
                    >
                      {{ stepIndex + 1 }}
                    </span>
                    <span class="min-w-0"><DocsInline :text="step" /></span>
                  </li>
                </ol>
                <figure v-if="section.image" class="mt-4">
                  <component
                    :is="docsFigures[section.image.figure]"
                    v-if="section.image.figure"
                    class="w-full rounded-md border border-border"
                  />
                  <img
                    v-else
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
            <p class="max-w-prose text-sm leading-relaxed text-foreground/85">
              The Aruna portal is where your research data lives: upload files, describe them as
              datasets, and run compute next to them. These docs get you working quickly and define
              every term the portal uses.
            </p>

            <RouterLink
              :to="{ name: 'docs', params: { topic: 'portal-tour' } }"
              class="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/[0.04] to-transparent px-4 py-4 transition-colors hover:border-primary/40"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                <Compass class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-display text-base font-semibold text-aruna-navy">Find your way around</span>
                <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  New here? Start with the tour: the dashboard, the top bar, the sidebar, and search.
                </span>
              </span>
              <ArrowRight class="h-4 w-4 shrink-0 text-primary" />
            </RouterLink>

            <!-- The core idea, drawn: data + metadata become a dataset, datasets form a graph. -->
            <section class="surface mt-4 overflow-hidden" aria-label="How Aruna organizes your work">
              <div class="overflow-x-auto">
                <div class="min-w-[560px] px-6 pb-4 pt-6">
                  <svg viewBox="0 0 720 208" role="img" aria-labelledby="docs-map-title" class="h-auto w-full font-sans">
                    <title id="docs-map-title">
                      Data plus metadata become a dataset, stored as an RO-Crate, and every dataset joins a graph you
                      can query, validate, and share.
                    </title>
                    <!-- data chip -->
                    <RouterLink v-slot="{ href, navigate }" :to="glossaryLink('data')" custom>
                      <a :href="href" role="link" aria-label="Data: open glossary entry" class="group/gnode cursor-pointer" @click="navigate">
                        <title>Data: open glossary entry</title>
                        <rect x="20" y="34" width="152" height="52" rx="10" class="fill-card stroke-border transition-colors group-hover/gnode:stroke-primary" stroke-width="1.5" />
                        <path
                          d="M40 48 h8 l5 5 v15 h-13 z M48 48 v5 h5"
                          fill="none"
                          class="stroke-primary"
                          stroke-width="1.5"
                          stroke-linejoin="round"
                        />
                        <text x="64" y="57" font-size="13" font-weight="600" class="fill-foreground transition-colors group-hover/gnode:fill-primary">Data</text>
                        <text x="64" y="73" font-size="10.5" class="fill-muted-foreground">your files</text>
                      </a>
                    </RouterLink>
                    <!-- plus -->
                    <circle cx="96" cy="104" r="11" class="fill-primary/10" />
                    <path d="M96 99 v10 M91 104 h10" class="stroke-primary" stroke-width="1.5" stroke-linecap="round" />
                    <!-- metadata chip -->
                    <RouterLink v-slot="{ href, navigate }" :to="glossaryLink('metadata')" custom>
                      <a :href="href" role="link" aria-label="Metadata: open glossary entry" class="group/gnode cursor-pointer" @click="navigate">
                        <title>Metadata: open glossary entry</title>
                        <rect x="20" y="122" width="152" height="52" rx="10" class="fill-card stroke-border transition-colors group-hover/gnode:stroke-primary" stroke-width="1.5" />
                        <path
                          d="M39 143 l9 -9 h11 v11 l-9 9 z"
                          fill="none"
                          class="stroke-primary"
                          stroke-width="1.5"
                          stroke-linejoin="round"
                        />
                        <circle cx="55" cy="138" r="1.6" class="fill-primary" />
                        <text x="66" y="145" font-size="13" font-weight="600" class="fill-foreground transition-colors group-hover/gnode:fill-primary">Metadata</text>
                        <text x="66" y="161" font-size="10.5" class="fill-muted-foreground">the description</text>
                      </a>
                    </RouterLink>
                    <!-- converging connectors -->
                    <path d="M172 60 C 218 60 224 104 264 104" fill="none" class="stroke-primary/50" stroke-width="1.5" />
                    <path d="M172 148 C 218 148 224 104 264 104" fill="none" class="stroke-primary/50" stroke-width="1.5" />
                    <path d="M258 98 l8 6 l-8 6" fill="none" class="stroke-primary" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    <!-- dataset -->
                    <RouterLink v-slot="{ href, navigate }" :to="glossaryLink('dataset')" custom>
                      <a :href="href" role="link" aria-label="Dataset: open glossary entry" class="group/gnode cursor-pointer" @click="navigate">
                        <title>Dataset: open glossary entry</title>
                        <rect x="272" y="68" width="184" height="72" rx="12" class="fill-primary/10 stroke-primary transition-[stroke-width] group-hover/gnode:[stroke-width:2.5]" stroke-width="1.5" />
                        <path
                          d="M292 96 l12 -7 12 7 v14 l-12 7 -12 -7 z M292 96 l12 7 12 -7 M304 103 v14"
                          fill="none"
                          class="stroke-primary"
                          stroke-width="1.5"
                          stroke-linejoin="round"
                        />
                        <text x="326" y="100" font-size="14" font-weight="600" class="fill-foreground">Dataset</text>
                        <text x="326" y="117" font-size="10.5" class="fill-muted-foreground">one RO-Crate bundle</text>
                      </a>
                    </RouterLink>
                    <!-- arrow to the graph -->
                    <path d="M456 104 H 508" fill="none" class="stroke-primary/50" stroke-width="1.5" />
                    <path d="M502 98 l8 6 l-8 6" fill="none" class="stroke-primary" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    <!-- graph -->
                    <RouterLink v-slot="{ href, navigate }" :to="glossaryLink('graph')" custom>
                      <a :href="href" role="link" aria-label="Graph: open glossary entry" class="group/gnode cursor-pointer" @click="navigate">
                        <title>Graph: open glossary entry</title>
                        <g class="stroke-primary/40 group-hover/gnode:stroke-primary/70" stroke-width="1.5">
                          <path d="M597 96 L 556 56" />
                          <path d="M597 96 L 664 62" />
                          <path d="M597 96 L 549 140" />
                          <path d="M597 96 L 657 142" />
                          <path d="M556 56 L 664 62" />
                        </g>
                        <circle cx="597" cy="96" r="9" class="fill-primary" />
                        <circle cx="556" cy="56" r="6" class="fill-card stroke-primary" stroke-width="1.5" />
                        <circle cx="664" cy="62" r="6" class="fill-card stroke-primary" stroke-width="1.5" />
                        <circle cx="549" cy="140" r="6" class="fill-card stroke-primary" stroke-width="1.5" />
                        <circle cx="657" cy="142" r="6" class="fill-card stroke-primary" stroke-width="1.5" />
                        <text x="606" y="178" font-size="13" font-weight="600" text-anchor="middle" class="fill-foreground transition-colors group-hover/gnode:fill-primary">A graph</text>
                        <text x="606" y="195" font-size="10.5" text-anchor="middle" class="fill-muted-foreground">
                          query · validate · share
                        </text>
                      </a>
                    </RouterLink>
                  </svg>
                </div>
              </div>
              <p class="border-t border-border/60 px-6 py-2.5 text-center text-xs text-muted-foreground">
                Select any step to open its glossary entry.
              </p>
            </section>

            <div class="mt-4 grid gap-4 sm:grid-cols-2">
              <RouterLink
                v-for="group in topicGroups"
                :key="group.kind"
                :to="{ name: 'docs', params: { topic: group.topics[0]?.slug } }"
                class="surface group/card flex flex-col gap-3 p-5 transition-colors hover:bg-muted"
              >
                <div class="flex items-center gap-2.5">
                  <span class="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <ListChecks v-if="group.kind === 'Guide'" class="h-4 w-4" />
                    <BookMarked v-else class="h-4 w-4" />
                  </span>
                  <h2 class="font-display text-base font-semibold text-aruna-navy">{{ group.label }}</h2>
                  <ArrowRight
                    class="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5 group-hover/card:text-primary"
                  />
                </div>
                <p class="text-sm leading-relaxed text-muted-foreground">{{ group.blurb }}</p>
                <span class="text-xs font-medium text-primary">
                  {{ group.topics.length }} {{ group.kind === 'Guide' ? 'guides' : 'topics' }} in the sidebar
                </span>
              </RouterLink>
            </div>

            <RouterLink
              :to="{ name: 'api-reference' }"
              class="surface mt-4 flex flex-wrap items-center gap-4 p-5 transition-colors hover:bg-muted"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Braces class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block font-display text-base font-semibold text-aruna-navy">API reference</span>
                <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Every REST endpoint of this node, styled and searchable, straight from its OpenAPI document.
                </span>
              </span>
              <ArrowRight class="h-4 w-4 shrink-0 text-primary" />
            </RouterLink>

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
