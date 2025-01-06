<script setup lang="ts">
import {IconCaretUpDown, IconCubePlus} from "@tabler/icons-vue";
import {VisSingleContainer, VisGraph, VisTooltip} from '@unovis/vue'
import {Graph, GraphLayoutType, Position, Tooltip} from '@unovis/ts'
import {ref, computed} from "vue"
import DataproxyDialog from "~/components/custom-ui/dialog/DataproxyDialog.vue";
import RealmComponentDialog from "~/components/custom-ui/dialog/RealmComponentDialog.vue";

/* ----- Deprecated imports ----- */
import {useToast} from '~/components/ui/toast/use-toast'

const {toast} = useToast()
import {nodes, links, sites, StatusMap, type NodeDatum, type LinkDatum} from './data-circular'
import type {v2Endpoint} from "~/composables/aruna_api_json";
/* ----- End Deprecated imports ----- */


/* ----- PROPERTIES ----- */
interface RealmsProps {
  realms: Realm[]
}

const props = defineProps<RealmsProps>()
const realms = toRef(() => props.realms)
const currentRealm = ref<string | undefined>(undefined)
/* ----- END PROPERTIES ----- */

const realmComponents = ref<v3Component[]>([])
const realmContext = ref<string | undefined>(undefined)
watch(realmContext, async () => {
  await $fetch<GetRealmComponentsResponse>('/api/v3/components', {
    query: {
      id: realmContext.value
    }
  }).then(response => {
    console.info('[Realms Component]', response)
    realmComponents.value = response.components
  })
})
EventBus.on('switchRealm', (realmId: string) => realmContext.value = realmId)


function displayDescription(description: string, maxLength: number = 50): string {
  return description.length > maxLength ? description.slice(0, maxLength) + " ..." : description
}

function splitDescription(description: string) {
  const splitIndex = description.indexOf('.')
  console.info('[Realms Component]', [description.slice(0, splitIndex), description.slice(splitIndex + 1)])
  return [description.slice(0, splitIndex), description.slice(splitIndex + 1)]
}

const disableTooltips = ref<boolean>(false)
const container = document.body
watch(disableTooltips, () => console.log('[Disabled Tooltips]', disableTooltips.value))


const componentDialogOpen = ref<boolean>(false)

function openComponentCreation(realmId: string) {
  currentRealm.value = realmId
  componentDialogOpen.value = true
}

function addComponent(component: v3Component) {
  toast({
    title: 'Event Received',
    description: `Received "AddComponent" event: ${component.id}`
  })
}

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
const clickedComponent: Ref<v3Component | undefined> = ref(undefined)
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
  <ComponentDialog :initial-open="detailDialogOpen"
                   :with-button="false"
                   :component="clickedComponent"
                   @update:open="detailDialogOpen = false"/>

  <RealmComponentDialog :initial-open="componentDialogOpen"
                        :with-button="false"
                        :realm-id="currentRealm"
                        @add-component=""
                        @update:open="componentDialogOpen = false"/>

  <div class="mx-4 mt-4 flex flex-col">
    <div class="flex flex-row items-center justify-center max-w-screen-2xl lg:max-w-[80vw]">
      <Table>
        <TableCaption>A list of your active realms</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead class="text-lg">Realm</TableHead>
            <TableHead class="text-lg">Description</TableHead>
            <TableHead class="text-lg">Id</TableHead>
            <TableHead class="text-lg">Tag</TableHead>
            <TableHead class="text-lg text-center">Deleted</TableHead>
            <TableHead class="text-lg text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="realm in realms" :key="realm.name">
            <TableCell class="font-bold">{{ realm.name }}</TableCell>
            <!--<TableCell>{{ displayDescription(realm.description, 128) }}</TableCell>-->
            <TableCell>

              <Collapsible>
                <div class="flex justify-between">
                  {{ splitDescription(realm.description)[0] }}.
                  <CollapsibleTrigger class="text-left">
                    <Button variant="ghost" class="p-0 text-aruna-highlight size-4">
                      <IconCaretUpDown/>
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent class="mt-2">
                  {{ splitDescription(realm.description)[1] }}
                </CollapsibleContent>
              </Collapsible>

            </TableCell>
            <TableCell class="font-medium">{{ realm.id }}</TableCell>
            <TableCell>{{ realm.tag }}</TableCell>
            <TableCell class="text-center">{{ realm.deleted }}</TableCell>
            <TableCell class="h-full flex justify-center items-center text-center">
              <IconCubePlus title="Create a new realm component"
                            class="text-aruna-text-accent hover:text-aruna-highlight hover:cursor-pointer"
                            @click="openComponentCreation(realm.id)"/>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <Separator class="my-6"/>

    <h2 class="mb-6 text-2xl font-bold md:text-3xl md:leading-tight text-aruna-text-accent">
      Components of currently selected realm:
    </h2>
    <Card v-for="component in realmComponents" class="w-fit">
      <CardHeader>
        <CardTitle>{{ component.name }}</CardTitle>
        <CardDescription>{{ component.id }}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre>{{ JSON.stringify(component, null, 2) }}</pre>
      </CardContent>
      <CardFooter>
        This component is public: {{ component.public }}
      </CardFooter>
    </Card>

    <!--
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
    -->
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

