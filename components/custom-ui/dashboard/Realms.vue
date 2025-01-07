<script setup lang="ts">
import {IconBucket, IconCaretUpDown, IconCubePlus, IconProgressCheck, IconServer} from "@tabler/icons-vue";
import {VisGraph, VisSingleContainer, VisTooltip} from '@unovis/vue'
import {Graph, GraphLayoutType, GraphNodeShape, type GraphPanelConfig, Position, TrimMode} from '@unovis/ts'
import {computed, ref} from "vue"
import ComponentDialog from "~/components/custom-ui/dialog/ComponentDialog.vue";
import RealmComponentDialog from "~/components/custom-ui/dialog/RealmComponentDialog.vue";

/* ----- Deprecated imports ----- */
import {useToast} from '~/components/ui/toast/use-toast'
import type {
  CreateS3CredentialsRequest,
  CreateS3CredentialsResponse,
  GetS3CredentialsFromUserResponse
} from "~/composables/api_wrapper";
import {ComponentType, Scope} from "~/types/aruna-v3-enums";

const {toast} = useToast()
/* ----- End Deprecated imports ----- */


/* ----- PROPERTIES ----- */
interface RealmsProps {
  realms: Realm[]
  selectedRealm: Realm
}

const props = defineProps<RealmsProps>()
const realms = toRef(() => props.realms)
const selectedRealm = toRef(() => props.selectedRealm)
const currentRealm = ref<string | undefined>(undefined)
/* ----- END PROPERTIES ----- */

onActivated(async () => {
  console.info('[Realms Component] Selected realm: ', selectedRealm.value)
  await $fetch<GetRealmComponentsResponse>('/api/v3/components', {
    query: {
      id: selectedRealm.value.id
    }
  }).then(response => {
    console.info('[Realms Component] Fetch components response:', response)
    realmComponents.value = response.components
    realmComponents.value.map(c => expandedRealms.value.add(JSON.parse(c.description).location))
  })
})

const displayAllRealms = ref<boolean>(false)
watch(displayAllRealms, (v) => console.info('[Realms Component] Display all realms:', v))

const displayAsCards = ref<boolean>(false)
watch(displayAsCards, (v) => console.info('[Realms Component] Display as cards:', v))


const realmContext = ref<string | undefined>(undefined)
const realmComponents = ref<v3Component[]>([]) //TODO: Integrate into realms
const componentCredentials = ref<Map<string, SimpleCredentials>>(new Map())

enum Status {
  Aruna = 'aruna',
  Healthy = 'healthy',
  Warning = 'warning',
  Inactive = 'inactive',
  Alert = 'alert'
}

const StatusMap = {
  //[Status.Aruna]: {color: '#005299', text: '&#xf00c;'},
  [Status.Aruna]: {color: '#00a0cc', text: '&#xf00c;'},
  [Status.Healthy]: {color: '#47e845', text: '&#xf00c;'},
  [Status.Warning]: {color: '#ffc226', text: '&#xf071;'},
  [Status.Inactive]: {color: '#dddddd', text: '&#xf00d;'},
  [Status.Alert]: {color: '#f88080', text: '&#x21;'},
}

export type NodeDatum = {
  id: string;
  label: string;
  site: string;
  group: string;
  subgroup: string;
  shape: GraphNodeShape;
  fill?: string,
  icon?: string;
  score?: number;
  status?: string;
  groupLabel?: string;
  clickable?: boolean, //TODO: Rename to expandable
  metaInfo?: v3Component;
  children?: NodeDatum[];
}

export type LinkDatum = {
  source: string;
  target: string;
  sourceGroup: string;
  targetGroup: string;
  status: Status;
  showTraffic: boolean;
}

type LocationHack = {
  location: string
}

type Site = {
  root: NodeDatum
  server: NodeDatum[]
  data: NodeDatum[]
  compute: NodeDatum[]
}

const expandedRealms = ref<Set<string>>(new Set())
//const expandedRealms = ref<string[]>([]) //TODO: Rename to expandedSites
watch(expandedRealms, () => console.info('[Realms Component] Expanded realms: ', expandedRealms), {deep: true})

const graphData = computed(() => {
  console.info('[Realms Component] Re-compute data for graph visualization with realm v3:', selectedRealm.value.name, realmComponents.value.length)
  const sites: Map<string, Site> = new Map()
  const serverIds: Set<string> = new Set()
  for (const component of realmComponents.value) {
    // Parse and store location of component
    const siteLocation: string = JSON.parse(component.description).location //TODO: Error handling
    let site: Site | undefined = undefined
    if (sites.has(siteLocation)) {
      site = sites.get(siteLocation)
    } else {
      site = {
        root: {
          id: `${siteLocation}-root`,
          site: siteLocation ? siteLocation : selectedRealm.value.tag,
          shape: GraphNodeShape.Circle,
          icon: '&#xf043;',
          label: siteLocation,
          group: siteLocation,
          subgroup: siteLocation,
          clickable: true,
        } as NodeDatum,
        server: [],
        data: [],
        compute: []
      }
      sites.set(siteLocation, site)
    }

    // Create child node from component and add to site
    let node = {
      id: component.id,
      site: siteLocation,
      group: siteLocation,
      subgroup: `${siteLocation}-${component.component_type}`, //rc.component_type === ComponentType.Server ? `${group}-${rc.component_type}` : `${group}-sub`,
      label: component.name,
      shape: GraphNodeShape.Circle, //shape,
      icon: '&#xf043;', //icon,
      status: Status.Aruna,
      score: 100,
      //fill: '#007BC2', //TODO: Depends on type (?)
      clickable: false, //c.component_type === ComponentType.Server,
      metaInfo: component,
    } as NodeDatum
    switch (component.component_type) {
      case ComponentType.Server:
        node.shape = GraphNodeShape.Square
        node.icon = '&#xf542;'
        site?.server.push(node)
        serverIds.add(component.id)
        break
      case ComponentType.Data:
        node.shape = GraphNodeShape.Hexagon
        node.icon = '&#xe4cf;'
        site?.data.push(node)
        break
      case ComponentType.Compute:
        node.shape = GraphNodeShape.Triangle
        node.icon = '&#xe4e2;'
        site?.compute.push(node)
        break
    }
  }

  // Collect nodes/links/panels depending on expanded sites
  let nodes: NodeDatum[] = []
  let links: LinkDatum[] = [] //TODO: Connect set of unique server ids
  let panels: GraphPanelConfig[] = []

  for (const [siteLocation, site] of sites) {
    if (expandedRealms.value.has(siteLocation)) {
      // Collect nodes in correct order
      site.server.concat(site.data).concat(site.compute).forEach(n => nodes.push(n))
      // Create links to server in locations
      site.data.concat(site.compute).forEach(n => {
        for (const s of site.server) {
          links.push({
            source: s.id,
            target: n.id,
            status: Status.Inactive,
            showTraffic: false
          } as LinkDatum)
        }
      })

      // Create panel for site
      panels.push({
        nodes: site.server.concat(site.data).concat(site.compute).map(n => n.id) || [],
        label: siteLocation,
        borderWidth: 3,
        padding: 25,
        dashedOutline: true, //curr === nodes[0],
        borderColor: '#00a0cc',
        //fillColor: '#b4b5bb',
        sideIconFontSize: '20px',
        sideIconShape: GraphNodeShape.Square,
        sideIconSymbol: '&#xf146;', //'&#xf043;',
        sideIconShapeSize: 30,
        sideIconSymbolColor: '#00a0cc',
        sideIconShapeStroke: '#00a0cc'
      })
    } else {
      nodes.push(site.root)
    }
  }

  // Return realm visualization data
  return {
    data: {
      nodes: nodes,
      links: links
    },
    panels: panels,
    panelOrder: [] //TODO: From largest to smallest?
  }
})

watch(selectedRealm, async () => {
  console.info('[Realms Component] Selected realm changed')
  await $fetch<GetRealmComponentsResponse>('/api/v3/components', {
    query: {
      id: selectedRealm.value.id
    }
  }).then(response => {
    console.info('[Realms Component] Fetch components response:', response)
    realmComponents.value = response.components
  })
})

function splitDescriptionAfter(description: string, words: number = 20) {
  const parts = description.split(' ')
  const teaser = parts.slice(0, words).join(' ')
  const rest = parts.slice(words, parts.length - 1).join(' ')
  return [teaser, rest]
}

const disableTooltips = ref<boolean>(false)
const container = document.body
watch(disableTooltips, () => console.log('[Disabled Tooltips]', disableTooltips.value))

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

async function createS3Credentials(component_id: string) {
  const request = {
    component_id: component_id,
    name: 'Some Credentials',
    expires_at: new Date(1735040153000).toISOString(),
    group_id: '01JFAP0EA748E60QQ55F452A2V', //TODO: ... ???
    realm_id: '01JFAP0EA7KDWQKPYWA7DV3VQ7', //TODO: Currently selected?
    scope: Scope.Personal
  } as CreateS3CredentialsRequest

  await $fetch<CreateS3CredentialsResponse>('/api/v3/credentials', {
    method: 'POST',
    body: request
  }).then(response => {
    console.info('[CreateS3Credentials Client] Response', response)
  })
}

async function getS3Credentials(component_id: string) {
  //TODO: Fetch all on activate and distribute?
  await $fetch<GetS3CredentialsFromUserResponse>('/api/v3/credentials')
      .then(response => {
        console.info('[GetS3CredentialsFromUser Client] Response', response)
      })
}

/* -------------------------------------------------------------------------------------------- */

// Hover tooltips for nodes
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
                      </dd>
                    </div>
                    <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-400">ID</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">${n.metaInfo.id}</dd>
                    </div>
                    <div class="p-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
                      <dt class="text-sm font-medium leading-6 text-gray-400">Variant</dt>
                      <dd class="mt-1 text-sm leading-6 text-gray-300 sm:col-span-2 sm:mt-0">${n.metaInfo.component_type}</dd>
                    </div>
                  </dl>
                </div>`
      }
      return null
    },
  }
})
const detailDialogOpen = ref<boolean>(false)

const clickedComponent: Ref<v3Component | undefined> = ref(undefined)
const componentDialogOpen = ref<boolean>(false)
// Graph config
const graphConfig = computed(() => ({
  events: {
    [Graph.selectors.node]: {
      click: (node: NodeDatum) => {
        console.info('[Realms Component] Clicked node:', node.label)
        if (node.clickable) {
          expandedRealms.value.add(node.site)
          console.info('Realms Component] Expanded: ', expandedRealms.value)
        } else if (node.metaInfo) {
          clickedComponent.value = node.metaInfo
          detailDialogOpen.value = true
        }
      }
    },
    [Graph.selectors.panelSideIcon]: {
      click: (panel: GraphPanelConfig) => {
        console.info('[Realms Component] Try to minimize panel:', panel.label)
        expandedRealms.value.delete(panel.label)
        console.info('[Realms Component] Expanded: ', expandedRealms.value)
      }
    }
  },
  nodeLabelTrim: false,
  nodeLabelTrimLength: 100,
  nodeLabelTrimMode: TrimMode.End,
  nodeGaugeValue: (n: NodeDatum) => n.score,
  nodeGaugeFill: (n: NodeDatum) => StatusMap[n.status]?.color,
  nodeIconSize: 25,
  nodeShape: (n: NodeDatum) => n.shape,
  nodeFill: (n: NodeDatum) => n.fill,
  /*
  nodeSideLabels: (n: NodeDatum) => [{
    radius: 8,
    fontSize: 4,
    ...(n.children ? {text: n.children.length} : StatusMap[n.status]),
  }],
  */
  nodeSize: (n: NodeDatum) => 75, //n.children ? 75 : 50,
  nodeSubLabel: (n: NodeDatum) => n.score && `Health: ${n.score}/100`,
  nodeSubLabelTrim: false,
  nodeSubLabelTrimLength: 100,
  nodeSubLabelTrimMode: TrimMode.End,
  nodeStrokeWidth: 3,
  linkFlow: (l: LinkDatum) => l.showTraffic,
  linkStroke: (l: LinkDatum) => StatusMap[l.status]?.color || null,
  linkBandWidth: (l: LinkDatum) => l.showTraffic ? 12 : 6,
}))


const expandedDescription = ref<Set<string>>(new Set())
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
            <TableCell>
              <div v-if="realm.description && realm.description.length > 256">
                <div class="flex justify-between items-center">
                  <div>
                    {{ splitDescriptionAfter(realm.description, 20)[0] }}
                    <Transition name="fade" mode="out-in">
                      <span key="closed" v-if="!expandedDescription.has(realm.id)">...</span>
                      <span key="opened" v-else>{{ splitDescriptionAfter(realm.description, 20)[1] }}</span>
                    </Transition>
                  </div>
                  <Button variant="ghost"
                          class="p-0 text-aruna-highlight size-4"
                          @click="expandedDescription.has(realm.id) ? expandedDescription.delete(realm.id) : expandedDescription.add(realm.id)">
                    <IconCaretUpDown/>
                  </Button>
                </div>
              </div>
              <div v-else>
                {{ realm.description }}
              </div>
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

    <div>
      <div class="flex gap-x-12 items-center mb-8">
        <h2 class="text-2xl font-bold md:text-3xl md:leading-tight text-aruna-text-accent">
          Realm Components of <span class="text-aruna-highlight">{{ selectedRealm.name }}</span>
        </h2>

        <div class="flex items-center gap-x-2">
          <Switch v-model:checked="displayAsCards"/>
          Display as Cards
        </div>
      </div>

      <div v-if="displayAsCards" class="h-full flex gap-6 flex-wrap">
        <Card v-for="component in realmComponents.sort((a: v3Component, b: v3Component) => a.id.localeCompare(b.id))"
              class="w-fit h-fit border-aruna-text/50">
          <CardHeader>
            <CardTitle class="relative flex justify-between">
              <span>{{ component.name }}</span>
              <TooltipProvider :delay-duration="50">
                <Tooltip>
                  <TooltipTrigger>
                    <IconServer v-if="component.component_type === ComponentType.Server"
                                class="absolute top-0 right-0 size-10 text-aruna-highlight"/>
                    <IconBucket v-if="component.component_type === ComponentType.Data"
                                class="absolute top-0 right-0 size-10 text-aruna-highlight"/>
                    <IconProgressCheck v-if="component.component_type === ComponentType.Compute"
                                       class="absolute top-0 right-0 size-10 text-aruna-highlight"/>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p v-if="component.component_type === ComponentType.Server">Aruna Server</p>
                    <p v-if="component.component_type === ComponentType.Data">Aruna DataProxy</p>
                    <p v-if="component.component_type === ComponentType.Compute">Compute Cluster</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription class="flex flex-col gap-y-2">
              <span>{{ component.id }}</span>
              <span>{{ component.description }}</span>
            </CardDescription>
          </CardHeader>
          <Separator/>
          <CardContent class="p-6 flex flex-col gap-y-2">
            <div v-for="endpoint in component.endpoints" class="flex gap-x-2">
              <span class="font-bold">{{ Object.keys(endpoint)[0] }}:</span>
              <span>{{ endpoint[Object.keys(endpoint)[0]] }}</span>
            </div>
          </CardContent>
          <Separator/>
          <CardContent class="p-6">
            This component is publicly available: {{ component.public }}
          </CardContent>
          <Separator/>
          <CardFooter v-if="component.component_type === ComponentType.Data"
                      class="p-6 flex flex-col gap-y-4 items-start">
            <div class="w-full flex gap-x-2 justify-between">
              <Button variant="outline" @click="getS3Credentials(component.id)">Get Credentials</Button>
              <Button variant="outline" @click="createS3Credentials(component.id)">Create Credentials</Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      <div v-else class="w-full h-full chart">
        <VisSingleContainer :data="graphData.data" height="60vh">
          <VisGraph v-bind="graphConfig"
                    :layoutType="GraphLayoutType.Parallel"
                    :layoutGroupOrder="[]"
                    :layoutNodeGroup="(n: NodeDatum) => n.group"
                    :layoutParallelNodeSubGroup="(n: NodeDatum) => n.subgroup"
                    :layoutParallelNodesPerColumn="1"
                    :layoutParallelGroupSpacing="100"
                    :layoutParallelSubGroupsPerRow="1"
                    :panels="graphData.panels"/>

          <VisTooltip v-if="!disableTooltips"
                      :container="container"
                      :triggers="triggers"
                      :follow-cursor="false"
                      :allow-hover="true"
                      :vertical-placement="Position.Auto"/>
        </VisSingleContainer>
      </div>
    </div>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

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

