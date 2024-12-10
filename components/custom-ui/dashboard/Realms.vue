<script setup lang="ts">
import {VisSingleContainer, VisGraph, VisTooltip} from '@unovis/vue'
import {Graph, GraphLayoutType, Position, Tooltip} from '@unovis/ts'
import {ref, computed} from "vue"

const realms = [
  {
    name: 'FAIR DS',
    status: 'Active',
    description: 'FAIR DS aims to create a comprehensive infrastructure that promotes the Findability, Accessibility, Interoperability, and Reusability (FAIR) of research data across various disciplines. By establishing data spaces that bridge different scientific fields, FAIR DS facilitates data sharing and collaboration on a national and international scale.',
    quota: '2.3 / 5.0 TiB',
  },
  {
    name: 'NFDI4Biodiversity',
    status: 'Active',
    description: 'NFDI4Biodiversity develops a digital infrastructure for biodiversity research, enabling the integration, sharing, and analysis of diverse biodiversity datasets. By providing resources and tools, it supports researchers and policymakers in understanding and addressing biodiversity-related challenges at local and global levels.',
    quota: '1.4 / 5.0 TiB',
  },
  {
    name: 'NFDI4Microbiota',
    status: 'Active',
    description: 'NFDI4Microbiota focuses on building a research data infrastructure specifically for microbiome and microbiota research. It provides standardized tools, protocols, and data management services to support data sharing, analysis, and long-term storage, fostering collaboration among microbiologists and related disciplines.',
    quota: '2.9 / 5.0 TiB',
  },
  {
    name: 'NFDI4Health',
    status: 'Inactive',
    description: 'NFDI4Health aims to establish a research data infrastructure tailored to public health and epidemiology. It provides tools, standards, and services to facilitate the secure collection, management, and sharing of health-related data. By promoting interoperability and supporting data-driven research, NFDI4Health enables researchers and policymakers to gain insights into population health trends and improve public health outcomes.',
    quota: '4.6 / 5.0 TiB',
  },
]

function displayDescription(description: string, maxLength: number = 50): string {
  return description.length > maxLength ? description.slice(0, maxLength) + " ..." : description
}

const disableTooltips = ref<boolean>(false)
const container = document.body
watch(disableTooltips, () => console.log('[Disabled Tooltips]', disableTooltips.value))

import {nodes, links, sites, StatusMap, type NodeDatum, type LinkDatum} from './data-circular'
import type {v2Endpoint} from "~/composables/aruna_api_json";
import DataproxyDialog from "~/components/custom-ui/dialog/DataproxyDialog.vue";

// Reactive statements
const expanded = ref<string[]>(['instance-gi', 'instance-bi', 'instance-be', 'instance-tu'])
const panels = computed(() => expanded.value.map(site => sites[site].panel))
const data = computed(() => ({
  nodes: nodes.flatMap<NodeDatum>(n => expanded.value.includes(n.site) ? n.children : n),
  links: links.map(l => ({
    ...l,
    source: expanded.value.includes(l.sourceGroup) ? l.source : sites[l.sourceGroup].groupNodeId,
    target: expanded.value.includes(l.targetGroup) ? l.target : sites[l.targetGroup].groupNodeId,
  })),
}))


const triggers = computed(() => {
  return {
    [Graph.selectors.node]: (n: NodeDatum) => {
      if (n.metaInfo) {
        return `<div id="${n.id}" class="p-4 bg-[#080d1f] rounded-sm border-2 border-gray-400 text-aruna-700">
                  <h3 class="font-bold text-aruna-700">Meta Info</h3>
                  <dl class="divide-y divide-gray-100">
                    <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-400">Name</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">${n.metaInfo.name}
                        <!--
                        <button onClick="showMe('${n.metaInfo.name}')" class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 w-9">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                            <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"></path>
                            <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"></path>
                          </svg>
                        </button>
                        -->
                      </dd>
                    </div>
                    <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-400">ID</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">${n.metaInfo.id}</dd>
                    </div>
                    <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-400">Variant</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">${n.metaInfo.epVariant}</dd>
                    </div>
                  </dl>
                </div>`
      }
      return null
    },
  }
})

const clickedEndpoint: Ref<v2Endpoint  | undefined> = ref(undefined)
const detailDialogOpen = ref<boolean>(false)

// Graph config
const graphConfig = computed(() => ({
  events: {
    [Graph.selectors.node]: {
      click: (node: NodeDatum) => {
        if (node.clickable) {
          expanded.value.includes(node.site) ?
              expanded.value.splice(expanded.value.indexOf(node.site), 1) :
              expanded.value.push(node.site)
        } else if (node.metaInfo) {
          clickedEndpoint.value = node.metaInfo
          detailDialogOpen.value = true
        }
      }
    },
  },
  nodeGaugeValue: (n: NodeDatum) => n.score,
  nodeGaugeFill: (n: NodeDatum) => StatusMap[n.status]?.color,
  nodeIconSize: 20,
  nodeShape: (n: NodeDatum) => n.shape,
  nodeFill: (n: NodeDatum) => n.fill,
  nodeSideLabels: (n: NodeDatum) => [{
    radius: 12,
    fontSize: 8,
    ...(n.children ? {text: n.children.length} : StatusMap[n.status]),
  }],
  nodeSize: (n: NodeDatum) => n.children ? 75 : 50,
  nodeSubLabel: (n: NodeDatum) => n.score && `${n.score}/100`,
  nodeStrokeWidth: 3,
  linkFlow: (l: LinkDatum) => l.showTraffic,
  linkStroke: (l: LinkDatum) => StatusMap[l.status]?.color || null,
  linkBandWidth: (l: LinkDatum) => l.showTraffic ? 12 : 6,
}))
</script>

<template>
  <DataproxyDialog :initial-open="detailDialogOpen"
                   :with-button="false"
                   :endpoint="clickedEndpoint"
                   @update:open="detailDialogOpen = false"/>

  <div class="flex flex-col">
    <div class="flex flex-row items-center justify-center max-w-screen-2xl lg:max-w-[80vw]">
      <Table>
        <TableCaption>A list of your active realms</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead class="text-lg">Realm</TableHead>
            <TableHead class="text-lg">Status</TableHead>
            <TableHead class="text-lg">Description</TableHead>
            <TableHead class="text-lg text-center">Quota</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="realm in realms" :key="realm.name">
            <TableCell class="font-medium">
              {{ realm.name }}
            </TableCell>
            <TableCell>{{ realm.status }}</TableCell>
            <TableCell>{{ displayDescription(realm.description, 128) }}</TableCell>
            <TableCell class="text-right">
              {{ realm.quota }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
    <Separator class="my-6"/>
    <div class="flex flex-col chart">
      <VisSingleContainer :data="data" height="60vh">
        <VisGraph v-bind="graphConfig"
                  :nodeLabelTrim="false"
                  :layoutType="GraphLayoutType.Parallel"
                  :layoutGroupOrder="['instance-bi', 'instance-gi', 'instance-be', 'instance-tu']"
                  :layoutNodeGroup="(n: NodeDatum) => n.group"
                  :layoutParallelNodeSubGroup="(n: NodeDatum) => n.subgroup"
                  :layoutParallelNodesPerColumn="1"
                  :layoutParallelGroupSpacing="100"
                  :layoutParallelSubGroupsPerRow="1"
                  :panels="panels"/>

        <VisTooltip v-if="!disableTooltips"
                    :container="container"
                    :triggers="triggers"
                    :follow-cursor="false"
                    :allow-hover="true"
                    :vertical-placement="Position.Auto"/>

      </VisSingleContainer>
    </div>
  </div>
</template>

<style>
.chart {
  --vis-graph-icon-font-family: 'Font Awesome 6 Free';
  --vis-graph-link-stroke-opacity: 0.8;
  --vis-graph-link-band-opacity: 0.2;
}

@font-face {
  font-family: 'Font Awesome 6 Free';
  src: url(https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/webfonts/fa-solid-900.woff2) format('woff2');
}
</style>

