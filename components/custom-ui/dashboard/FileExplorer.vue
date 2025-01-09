<script lang="ts" setup>
import {
  IconCheck,
  IconExclamationCircle,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconFolderSymlink,
  IconInfoCircle,
  IconLoader3,
  IconLock,
  IconPlus,
  IconTreadmill,
  IconUpload,
  IconWorld,
} from '@tabler/icons-vue'
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator,} from '@/components/ui/breadcrumb'

import type {GetRelationsResponse, ResourceElement} from "~/composables/api_wrapper"
import {fetchChildren} from "~/composables/api_wrapper";
import {ResourceVariant, SyncingStatus, VisibilityClass} from "~/types/aruna-v3-enums"
import {toast} from "~/components/ui/toast";
import {h} from "vue";

const StatusMap = {
  [SyncingStatus.Pending]: IconLoader3,
  [SyncingStatus.Running]: IconTreadmill,
  [SyncingStatus.Finished]: IconCheck,
  [SyncingStatus.Error]: IconExclamationCircle,
}

const licenses = [
  {id: '01JFD6QDYWXTF2SXBQEW1VKM95', tag: 'CC0', label: 'Creative Commons Zero (CC0 1.0)'},
  {
    id: '01JFD6R28H3XMX2DRQZ7CEC200',
    tag: 'CC-BY-SA 4.0',
    label: 'Attribution-ShareAlike 4.0 International (CC-BY-SA 4.0)'
  },
  {
    id: '01JFD6R7BBJQ7C1BDYQE2NADR6',
    tag: 'CC-BY-NC 4.0',
    label: 'Attribution-NonCommercial 4.0 International (CC-BY-NC)'
  },
  {
    id: '01JFD6RC1JQHYWX4F4ZB1EBN0T',
    tag: 'CC-BY-NC-SA 4.0',
    label: 'Attribution-NonCommercial-ShareAlike 4.0 International (CC-BY-NC-SA)'
  }
] //await fetchLicenses()

/* ----- Dropzone ----- */
import {useDropZone} from "@vueuse/core"
import KeyValueDialog from "~/components/custom-ui/dialog/KeyValueDialog.vue";
import AuthorDialog from "~/components/custom-ui/dialog/AuthorDialog.vue";

const dropZoneRef = ref<HTMLDivElement>()

// Object meta
const fileUpload = ref<File | null>(null)
const fileName = ref<string | null>(null)
const fileTitle = ref<string | null>(null)
const parent = ref<ResourceElement | null>(null)

function onDrop(files: File[] | null) {
  // called when files are dropped on zone
  console.log('[FileExplorer] Dropped files:', files)

  if (files && files.length > 0) {
    fileUpload.value = files[0]
    fileName.value = fileUpload.value.name
    parent.value = currentHierarchy.value[currentHierarchy.value.length - 1]

    infoOpen.value = true
  }
}

const {isOverDropZone} = useDropZone(dropZoneRef, {
  onDrop,
  // control multi-file drop
  multiple: false,
  // whether to prevent default behavior for unhandled events
  preventDefaultForUnhandled: false,
})
/* ----- End Dropzone ----- */


/* ----- PROPERTIES ----- */
interface FileExplorerProps {
  resources: ResourceElement[]
}

const props = defineProps<FileExplorerProps>()
// Loaded resources -> Default: your projects
// Children are lazy loaded
const loadedResources: Ref<ResourceElement[]> = toRef(() => props.resources)
watch(loadedResources, () => console.log(loadedResources.value.length))
/* ----- END PROPERTIES ----- */

/* ----- Const variable magic */
const currentHierarchy: Ref<ResourceElement[]> = ref([])
const displayedResources: Ref<ResourceElement[]> = ref(loadedResources.value)

const infoSelection: Ref<ResourceElement | undefined> = ref(undefined)
watch(infoSelection, () => console.log('[FileExplorer] Current selection:', infoSelection.value))
const infoOpen: Ref<boolean> = ref(false)

watchEffect(async () => {
  console.log('[FileExplorer] Current Hierarchy:', currentHierarchy.value.map(ele => ele.id).join(', '))
  if (currentHierarchy.value.length <= 0) {
    displayedResources.value = loadedResources.value
  } else {
    const currentResource = currentHierarchy.value.slice(-1)[0]

    //if (currentResource && currentResource.children.length > 0) {
    //  displayedRes.value = currentResource.children
    //  return
    //}

    // Fetch children
    const children: ResourceElement[] = await fetchChildren(currentResource.id)

    // Add to loaded resources
    addChildren(loadedResources.value, currentResource.id, children)

    // Return children
    displayedResources.value = children
  }
})

/* ----- */

function openInfo(resource: ResourceElement) {
  infoSelection.value = resource
  infoOpen.value = true
}

function closeInfo() {
  fileUpload.value = null
  infoOpen.value = false
}

async function deleteResource(resource: ResourceElement) {
  await $fetch<DeleteResourcesResponse>('/api/v3/resource', {
    method: 'DELETE',
    query: {
      id: resource.id
    }
  }).then(response => resource.deleted = true)
}

function navigateBack(resourceId: string) {
  // Clear met info field:
  infoOpen.value = false
  infoSelection.value = undefined

  // Navigate
  if (resourceId === 'root') {
    currentHierarchy.value = []
    return
  }
  const index = currentHierarchy.value.map(res => res.id).indexOf(resourceId)
  currentHierarchy.value = currentHierarchy.value.slice(0, index)
}

async function navigateForward(element: ResourceElement) {

  // Check if is locked
  if (element.variant === ResourceVariant.Object || element.locked)
    return

  // Fetch child relations to check if user has permissions
  //TODO: In future there will be an authorization endpoint?
  await $fetch<GetRelationsResponse>(`/api/v3/relations`, {
    query: {
      node: element.id,
      direction: 'Outgoing',
      offset: 0,
      page_size: Number.MAX_SAFE_INTEGER
    }
  }).then(response => {
    console.info('[Navigate Forward] Fetched relations:', response.relations)
    //return response.relations.filter(rel => rel.relation_type === 'HasPart').map(rel => rel.to_id)
    currentHierarchy.value.push(element)
    infoOpen.value = false
    infoSelection.value = undefined
  }).catch(error => {
    console.dir(error.data)
    if (error.data.statusCode === 403) {
      toast({
        description: h('div',
            {class: 'flex space-x-2 items-center justify-center'},
            [
              h(IconLock, {class: 'flex-shrink-0 size-5'}),
              h('span',
                  {class: 'text-aruna-text-accent'},
                  [`Not authorized to view sub-resources of ${element.title || element.name}`])
            ]),
        duration: 10000
      })
    } else {
      toast({
        title: 'Error',
        description: `Error [${error.data.statusCode}]: ${error.data.data}`
      })
    }
  })


  /*
  if (element.variant != ResourceVariant.Object) {
    currentHierarchy.value.push(element)
    infoOpen.value = false
    infoSelection.value = undefined
  }
  */
}

function addChildren(array: ResourceElement[], id: string, children: ResourceElement[]): ResourceElement | undefined {
  for (const item of array) {
    if (item.id === id) {
      item.children = children
      return item;
    }

    if (item.children?.length) {
      const innerResult = addChildren(item.children, id, children);
      if (innerResult) return innerResult;
    }
  }
}

const actions = [
  //{name: 'Upload', icon: IconUpload},
  {name: 'Create', icon: IconPlus},
  //{name: 'Download', icon: IconDownload},
]

function emitTabSwitch(tabId: string) {
  EventBus.emit('setTab', tabId);
}

function checkDirection(): 'horizontal' | 'vertical' {
  console.log(window.matchMedia('(min-width: 1024px)').matches)
  if (window.matchMedia('(min-width: 1024px)').matches) {
    return 'horizontal'
  } else {
    return 'vertical'
  }
}
</script>
<template>
  <div class="flex flex-col h-full w-full py-6 ps-6">
    <!-- Header -->
    <div class="flex h-14 items-center justify-between border-b px-6 border-gray-800 bg-gray-900">
      <nav aria-label="breadcrumb">
        <Breadcrumb>
          <BreadcrumbList class="text-aruna-text-accent">
            <BreadcrumbItem @click="navigateBack('root')"
                            class="hover:cursor-pointer">Your Projects
            </BreadcrumbItem>
            <div v-for="ele in currentHierarchy"
                 class="flex items-center justify-center gap-2.5">
              <BreadcrumbSeparator/>
              <BreadcrumbItem v-if="ele.variant !== ResourceVariant.Object"
                              @click="navigateBack(ele.id)"
                              class="hover:cursor-pointer">
                {{ !ele.deleted ? ele.name : 'DELETED' }}
              </BreadcrumbItem>
              <BreadcrumbItem v-else>
                {{ !ele.deleted ? ele.name : 'DELETED' }}
              </BreadcrumbItem>
            </div>
          </BreadcrumbList>
        </Breadcrumb>
      </nav>

      <!-- Action Buttons -->
      <div class="flex items-center gap-4">
        <button v-for="action in actions"
                :key="action.name"
                @click="emitTabSwitch('ResourceCreation')"
                class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3">
          <component :is="action.icon"
                     class="h-4 w-4 mr-2"/>
          {{ action.name }}
        </button>
      </div>
      <!-- End Action Buttons -->
    </div>
    <!-- End Header -->

    <ResizablePanelGroup id="file-explorer-list"
                         :direction="checkDirection()"
                         class="h-full">
      <ResizablePanel>
        <!--
        <div :class="{'opacity-50': isOverDropZone}"
            class="absolute flex w-full h-full items-center justify-center opacity-0 transition-all ease-in-out delay-50 duration-500">
          <div class="flex flex-col bg-aruna-highlight items-center justify-center gap-y-6 p-32 border-2 border-dashed border-aruna-text-accent rounded-sm">
            Drop your file here
            <IconPlus class="flex-shrink-0 size-8 text-aruna-text-accent border rounded-full border-aruna-text-accent"/>
          </div>
        </div>
        -->

        <!-- Flexbox Resource Display -->
        <div class="flex flex-row flex-wrap content-start items-start justify-start gap-x-6 gap-y-6 my-4">
          <Card v-for="resource in displayedResources"
                class="rounded-sm border-aruna-text/50 flex flex-col items-center justify-center min-w-[200px] max-w-[300px] h-fit"
                @dblclick="navigateForward(resource)">
            <CardContent class="p-0 flex flex-col items-center w-full">
              <div class="w-full flex gap-x-2">
                <div class="group flex flex-col grow py-4 ps-4 items-center justify-center">
                  <div class="flex h-fit w-full items-center justify-center">
                    <IconWorld v-if="resource.variant === ResourceVariant.Project"
                               :class="{'text-destructive group-hover:text-destructive': resource.deleted}"
                               class="h-12 w-12 text-aruna-text-accent group-hover:text-aruna-highlight"/>
                    <IconFolder v-else-if="resource.variant === ResourceVariant.Folder"
                                :class="{'text-destructive group-hover:text-destructive': resource.deleted}"
                                class="h-12 w-12 text-aruna-text-accent group-hover:text-aruna-highlight"/>
                    <IconFile v-else-if="resource.variant === ResourceVariant.Object"
                              :class="{'text-destructive group-hover:text-destructive': resource.deleted}"
                              class="h-12 w-12 text-aruna-text-accent group-hover:text-aruna-highlight"/>
                  </div>
                  <div v-if="!resource.deleted" class="max-w-52 truncate overflow-ellipsis">
                    {{ resource.title ? resource.title : resource.name }}
                  </div>
                  <div v-else class="text-destructive">DELETED</div>
                  <span v-if="resource.variant === ResourceVariant.Object" class="text-aruna-text">
                    {{ `Size: ${formatBytes(resource.content_len)}` }}
                  </span>
                  <span v-else class="text-aruna-text">
                    {{ `Children: ${resource.children.length}` }}
                  </span>
                </div>
                <div class="flex flex-col justify-between border-l text-aruna-text">
                  <IconInfoCircle @click="openInfo(resource)"
                                  class="m-2 hover:cursor-pointer hover:text-aruna-highlight"/>
                  <IconFolderPlus class="m-2 hover:cursor-pointer hover:text-aruna-highlight"/>
                  <IconFolderSymlink @click="navigateForward(resource)"
                                     class="m-2 hover:cursor-pointer hover:text-aruna-highlight"/>

                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Dropbox Card -->
          <Card v-if="currentHierarchy.length > 0"
                class="min-w-[200px] py-4 px-2 h-fit flex items-center justify-center rounded-sm border border-dashed border-aruna-highlight transition-all ease-in-out delay-50 duration-250"
                :class="{'bg-aruna-highlight/25': isOverDropZone}"
                ref="dropZoneRef">
            <CardContent>
              <div class="flex flex-col gap-y-6 items-center justify-center text-aruna-highlight">
                <IconUpload class="h-12 w-12"/>
                Drop your file here
              </div>
            </CardContent>
          </Card>
          <!-- End Dropbox Card -->
        </div>
        <!-- End Flexbox Resource Display -->

        <!-- No resources display -->
        <div v-if="loadedResources && loadedResources.length <= 0"
             class="m-4 p-4 w-fit mx-auto flex flex-1 items-center justify-center rounded-md border border-dashed border-slate-500 shadow-sm">
          <div class="flex flex-col items-center gap-1 text-center">
            <h3 class="text-2xl font-bold tracking-tight">
              You do not have created any resources yet.
            </h3>
            <p class="text-sm text-muted-foreground">
              Start your exciting Aruna journey with the creation of your first resource.
            </p>

            <Button @click="emitTabSwitch('ResourceCreation')"
                    class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-primary-foreground shadow h-9 px-4 py-2 mt-4 bg-aruna-800 hover:bg-aruna-700 dark:bg-aruna-700 dark:hover:bg-aruna-600">
              Create Resource
            </Button>
          </div>
        </div>
        <!-- End no resources display -->
      </ResizablePanel>
      <ResizableHandle v-if="infoOpen" id="file-explorer-handle" class="mt-2" with-handle/>
      <ResizablePanel v-if="infoOpen" id="file-explorer-info" :default-size="25" :min-size="25" :max-size="50">
        <!-- Flexbox file meta display -->
        <div style="transition-behavior: allow-discrete;"
             :class="{'visible flex translate-x-0 ' : infoOpen, 'invisible hidden translate-x-full' : !infoOpen}"
             class="transition-all duration-500 flex-col h-full mt-2 p-4 border-l border-aruna-text/50 gap-y-4 justify-between">

          <div v-if="fileUpload" class="gap-y-4 flex flex-col">
            <h2 class="text-2xl">Upload file</h2>
            <Separator class="bg-aruna-text/50 my-4"/>

            <Table>
              <TableBody>
                <TableRow>
                  <TableCell class="w-[1%]">Name:</TableCell>
                  <TableCell class="text-aruna-text">{{ fileUpload.name }}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Size:</TableCell>
                  <TableCell class="text-aruna-text">{{ formatBytes(fileUpload.size) }}</TableCell>
                </TableRow>
                <TableRow v-if="fileUpload.type">
                  <TableCell>Type:</TableCell>
                  <TableCell class="text-aruna-text">{{ fileUpload.type }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!--
            <dl class="flex flex-col">
              <div class="flex gap-x-4">
                <dt class="text-aruna-text-accent">Name:</dt>
                <dd class="text-aruna-text truncate overflow-ellipsis">{{ fileUpload.name }}</dd>
              </div>
              <div class="flex gap-x-4">
                <dt class="text-aruna-text-accent">Size:</dt>
                <dd class="text-aruna-text">{{ formatBytes(fileUpload.size) }}</dd>
              </div>
              <div class="flex gap-x-4">
                <dt class="text-aruna-text-accent">Type:</dt>
                <dd class="text-aruna-text truncate overflow-ellipsis">{{ fileUpload.type || 'N/A' }}</dd>
              </div>
            </dl>
            -->

            <Separator class="bg-aruna-text/50 my-4"/>

            <Label for="description">Description</Label>
            <Textarea id="description"
                      :rows="3"
                      placeholder="Here you can enter a description of your resource"
                      class="py-3 px-4 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                   focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                   focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                   disabled:opacity-50 disabled:pointer-events-none"/>

            <div class="flex sm:flex-col w-fit gap-y-4">
              <Label for="labels">Labels</Label>
              <KeyValueDialog :initial-open="false" :with-button="true"/>
            </div>

            <div class="flex sm:flex-col w-fit gap-y-4">
              <Label for="authors">Authors</Label>
              <AuthorDialog :initial-open="false" :with-button="true"/>
            </div>

            <Label for="license">License</Label>
            <Select>
              <SelectTrigger class="bg-aruna-muted w-full max-w-[450px]">
                <SelectValue placeholder="Select a license for your resource"/>
              </SelectTrigger>
              <SelectContent class="bg-aruna-bg/90 truncate overflow-ellipsis">
                <SelectGroup>
                  <SelectItem v-for="license in licenses" :value="license.tag"
                              class="hover:bg-aruna-fg">
                    {{ license.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div v-else-if="infoSelection" class="gap-y-4">
            <h2 class="text-2xl">{{ infoSelection?.title || 'Title not available' }}</h2>
            <Separator class="bg-aruna-text/50 mt-6"/>
            <!--<span class="text-sm font-medium leading-6 text-aruna-text-accent">Labels:</span>-->
            <ScrollArea>
              <div class="flex p-4 ps-0 space-x-4 w-max whitespace-nowrap truncate">
                <div v-for="label in infoSelection?.labels"
                     class="flex flex-row my-1 last:me-0">
                  <span :class="{'rounded-md': label.value === '' || label.value === undefined,
                                 'rounded-l-md': label.value && label.value.length > 0}"
                        class="text-xs font-medium truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1 px-2 rounded-l-md text-aruna-highlight border border-aruna-highlight">
                    {{ label.key }}
                  </span>
                  <span v-if="label.value"
                        class="truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1 px-2 rounded-r-lg text-xs font-medium border border-l-0 border-aruna-highlight text-aruna-bg bg-aruna-highlight">
                    {{ label.value }}
                  </span>
                </div>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            <Table class="table-auto">
              <TableBody class="">
              <TableRow>
                <TableCell class="w-fit text-sm font-medium leading-6 text-aruna-text-accent">Id:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.id || '' }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Name:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.name || '' }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="align-text-top text-sm font-medium leading-6 text-aruna-text-accent">Description:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.description || '' }}
                </TableCell>
              </TableRow>
              <TableRow v-if="infoSelection?.variant === ResourceVariant.Object">
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Size:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ formatBytes(infoSelection?.content_len || 0) }}
                </TableCell>
              </TableRow>
              <TableRow v-else>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Children:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.count || 0 }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Created At:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ formatDate(infoSelection?.created_at || '') }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Last Modified:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ formatDate(infoSelection?.last_modified || '') }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">License:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.license_id || '' }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm align-text-top font-medium leading-6 text-aruna-text-accent">Locations:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  <ul class="list-disc">
                    <li class="flex gap-x-2" v-for="loc in infoSelection?.location">
                      <component :is="StatusMap[loc.status as keyof typeof StatusMap]"
                                 :class="{'text-aruna-text-accent animate-spin': loc.status === SyncingStatus.Pending,
                                          'text-aruna-text-accent': loc.status === SyncingStatus.Running,
                                          'text-green-600': loc.status === SyncingStatus.Finished,
                                          'text-destructive': loc.status === SyncingStatus.Error}"/>
                      {{ loc.endpoint_id }}
                    </li>
                  </ul>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Locked:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.locked || 'N/A' }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Visibility:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.visibility || '' }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Deleted:</TableCell>
                <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                  {{ infoSelection?.deleted }}
                </TableCell>
              </TableRow>
              </TableBody>
            </Table>
          </div>

          <div class="flex gap-x-4">
            <Button v-if="fileUpload"
                    variant="outline"
                    @click="console.log('Create resource and upload file')"
                    disabled
                    class="inline-flex w-fit bg-transparent text-aruna-highlight border border-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
              Upload
            </Button>
            <Button variant="outline"
                    @click="closeInfo"
                    class="inline-flex w-fit bg-transparent text-aruna-text border border-aruna-text hover:bg-aruna-h hover:text-aruna-text-accent hover:border-aruna-text-accent">
              Close
            </Button>

            <Button v-if="infoSelection"
                    variant="outline"
                    @click="deleteResource(infoSelection)"
                    class="inline-flex w-fit bg-transparent text-destructive border border-destructive hover:bg-destructive/25 hover:text-destructive">
              Delete
            </Button>
          </div>

        </div>
        <!-- End Flexbox file meta display -->
      </ResizablePanel>
    </ResizablePanelGroup>


  </div>
</template>
