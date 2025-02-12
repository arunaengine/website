<script lang="ts" setup>
import {
  IconCheck,
  IconEdit,
  IconExclamationCircle,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconFolderSymlink,
  IconInfoCircle,
  IconLoader3,
  IconLock,
  IconLockOpen2,
  IconPlus,
  IconTreadmill,
  IconUpload,
  IconWorld,
  IconX
} from '@tabler/icons-vue'
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator,} from '@/components/ui/breadcrumb'
import {
  Pagination,
  PaginationList,
  PaginationListItem,
  PaginationFirst,
  PaginationPrev,
  PaginationEllipsis
} from "~/components/ui/pagination";

import type {
  CreateResourceRequest,
  GetRelationsResponse,
  ResourceElement,
  SimpleCredentials
} from "~/composables/api_wrapper"
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
import {Upload} from "@aws-sdk/lib-storage";
import {S3Client} from "@aws-sdk/client-s3";
import type {S3ClientConfig} from "@aws-sdk/client-s3/dist-types/S3Client";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "~/components/ui/tooltip";
import EditableLabel from "~/components/custom-ui/EditableLabel.vue";

const dropZoneRef = ref<HTMLDivElement>()

// File upload meta
const fileUpload = ref<File | null>(null)
const fileName = ref<string | null>(null)
const fileTitle = ref<string | null>(null)
const fileDescription = ref<string | null>(null)
const fileLicense = ref<string | null>(null)
const fileAuthors = ref<Map<string, Author>>(new Map())
const fileLabels = ref<Map<string, KeyValue>>(new Map())
const parent = ref<ResourceElement | null>(null)
const fileUploadProgress = ref<number>(0)
watch(fileUploadProgress, (v) => console.info('[FileExplorer] Upload progress:', v))

function onDrop(files: File[] | null) {
  if (files && files.length > 0) {
    //Clear meta info context
    infoSelection.value = undefined

    // Set file upload context and open sidebar
    fileUpload.value = files[0]
    fileName.value = fileUpload.value.name
    parent.value = currentHierarchy.value[currentHierarchy.value.length - 1]  // Last element of current hierarchy

    infoOpen.value = true
  }
}

const {isOverDropZone} = useDropZone(dropZoneRef, {
  onDrop,
  // Control multi-file drop
  multiple: false,
  // Whether to prevent default behavior for unhandled events
  preventDefaultForUnhandled: false,
})

function updateProgress(current: number, total: number | undefined) {
  if (!total)
    return 0
  const floatProgress = current / total * 100
  fileUploadProgress.value = +floatProgress.toFixed(2)
}

// ----- End Dropzone ---------- //


// ----- PROPERTIES ---------- //
interface FileExplorerProps {
  resources: ResourceElement[]
  licenses: License[]
}

const props = defineProps<FileExplorerProps>()
const licenseMap = computed(() => new Map<string, License>(props.licenses.map(license => [license.id, license])))
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

const nameEditMode = ref(false)
const titleEditMode = ref(false)
const descriptionEditMode = ref(false)

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
    const children: ResourceElement[] = await fetchChildren(currentResource.id, offset.value, pageSize.value)

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
  // Clear meta info context
  infoOpen.value = false
  infoSelection.value = undefined

  // Clear file upload context
  clearFileMeta()
}

function clearFileMeta() {
  fileUpload.value = null
  fileName.value = null
  fileTitle.value = null
  fileDescription.value = null
  fileLicense.value = null
  fileLabels.value.clear()
  fileAuthors.value.clear()
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
  // Clear meta info context
  infoOpen.value = false
  infoSelection.value = undefined

  // Clear file upload context
  clearFileMeta()

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
      offset: offset.value, //0,
      page_size: pageSize.value //Number.MAX_SAFE_INTEGER
    }
  }).then(response => {
    console.info('[Navigate Forward] Fetched relations:', response.relations)

    element.count = response.total_hits
    totalHits.value = response.total_hits
    currentHierarchy.value.push(element)
    infoOpen.value = false
    infoSelection.value = undefined
    clearFileMeta()
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

async function submitUpload() {
  await $fetch<GetS3CredentialsFromUserResponse>('/api/v3/credentials')
      .then(async response => {

        //TODO: Finish GetS3Credentials when it also returns secret
        return {
          access_key: '01JGXX8S57F7MDKGKBNM5MJSVK.3',
          secret_key: '9f829eef9778c246d8f1b549dd9ee8525df6cc65f9bc0763559eaccb15ada1521af0be7f6c0d6d70b58efc24eb8340541bf98b630bbee818b9b56334bee48859',
        }

        // Check if S3 credentials for data proxy exist
        for (const token of response.tokens) {
          if (token.token_info.component_id === '<Component-Id>')
            return {
              access_key: token.access_key,
              secret_key: '<Secret-Key>'
            }
        }
        // No credentials found
        throw new Error(`No S3 credentials available for component: <Component-Id>`)

      }).then(async credentials => {
        console.info('[FileUpload] Credentials:', credentials)
        const request = {
          variant: ResourceVariant.Object,
          parent_id: parent.value?.id,
          name: fileName.value,
          title: fileTitle.value,
          description: fileDescription.value,
          license_id: fileLicense.value,
          labels: [], //TODO: Map to Array
          authors: [], //TODO: Map to Array
          visibility: VisibilityClass.Public,
          identifiers: []
        } as CreateResourceRequest

        //TODO: Finish create Object resource when the Aruna Data service is able to process events
        /*
        await $fetch<CreateResourceResponse>('/api/v3/resource', {
          method: 'POST',
          body: request
        })
        */

        return [credentials, 'http://localhost:1337']

      }).then(async ([credentials, endpoint_url]) => {
        //TODO: Upload data via S3
        // Create S3 client for staging object
        const s3client = new S3Client({
          endpoint: endpoint_url,
          region: 'region-one',
          credentials: {
            accessKeyId: (credentials as SimpleCredentials).access_key,
            secretAccessKey: (credentials as SimpleCredentials).secret_key,
          }
        } as S3ClientConfig)

        const bucket = currentHierarchy.value[0].name
        const pathParts = currentHierarchy.value.slice(1)
        const key = pathParts.length > 0 ? `${pathParts.join('/')}/${fileUpload.value?.name}` : fileUpload.value?.name

        console.info('[FileExplorer] Bucket and key:', bucket, currentHierarchy.value.slice(1), key, `${endpoint_url}/${bucket}/${key}`)

        if (fileUpload.value) {
          const upload = new Upload({
            client: s3client as S3Client,
            queueSize: 4, // 4 uploads concurrently
            partSize: fileUpload.value.size > 5 * 1024 * 1024 * 1024 ? 50 * 1024 * 1024 : 5 * 1024 * 1024, // 5MiB parts up to 5GiB; then 50MiB parts
            leavePartsOnError: false, // Remove uploaded parts on error
            params: {
              Bucket: bucket,
              Key: key as string,
              Body: fileUpload.value
            },
          })

          // Update progress bar value
          upload.on("httpUploadProgress", progress =>
              updateProgress(progress.loaded ? progress.loaded : 0, progress.total))

          // Do something after upload succeeded
          return await upload.done() //.then(() => console.log('Upload succeeded'))
        }

        throw new Error('No file selected... that is very late...')

      }).then(response => {
        console.log(`Upload completed with status code: ${response.$metadata.httpStatusCode}`)
      }).catch(error => {
        console.error('[FileExplorer Client] Upload error:', error.data)
        toast({
          title: 'Error',
          description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'},
              h('code', {class: 'text-white'}, JSON.stringify(error.message, null, 2))),
          duration: -1
        })
      })
}


// ----- Pagination ---------- //
const currentPage = ref<number>(1)
const pageSize = ref<number>(3)
const totalHits = ref<number>(6)
const offset = computed(() => (currentPage.value - 1) * pageSize.value)
watch(offset, () => {
  console.info(`[FileExplorer] Current page: ${currentPage.value}, Current page size: ${pageSize.value}, Current offset: ${offset.value}`)
  console.info('[FileExplorer] Current resource children:', currentHierarchy.value[currentHierarchy.value.length - 1].children.length)
})

// ----- End Pagination ---------- //

// ----- Update Functions --------------------
async function updateName(resourceId: string, name: string) {
  await $fetch('/api/v3/resources/name', {
    method: 'POST',
    body: {
      id: resourceId,
      name: name
    }
  }).then(() => {
    infoSelection.value.name = name
    nameEditMode.value = false
    toast({
      description: h('div',
          {class: 'flex space-x-2 items-center justify-center text-aruna-text-accent'},
          [
            h(IconCheck, {class: 'flex-shrink-0 size-6 text-aruna-highlight'}),
            h('span',
                {class: 'text-fuchsia-50'},
                ['Name successfully updated.'])
          ]),
      duration: 5000
    })
  }).catch(error => {
    toast({
      title: 'Error',
      //description: 'Something went wrong. If this problem persists please contact an administrator.',
      description: `Failed to update name: ${error.data.message}`,
      variant: 'destructive',
      duration: 10000,
    })
  })
}

async function updateTitle(resourceId: string, title: string) {
  await $fetch('/api/v3/resources/title', {
    method: 'POST',
    body: {
      id: resourceId,
      title: title
    }
  }).then(() => {
    infoSelection.value.title = title
    titleEditMode.value = false
    toast({
      description: h('div',
          {class: 'flex space-x-2 items-center justify-center text-aruna-text-accent'},
          [
            h(IconCheck, {class: 'flex-shrink-0 size-6 text-aruna-highlight'}),
            h('span',
                {class: 'text-fuchsia-50'},
                ['Title successfully updated.'])
          ]),
      duration: 5000
    })
  }).catch(error => {
    toast({
      title: 'Error',
      //description: 'Something went wrong. If this problem persists please contact an administrator.',
      description: `Failed to update title: ${error.data.message}`,
      variant: 'destructive',
      duration: 10000,
    })
  })
}

async function updateDescription(resourceId: string, description: string) {
  await $fetch('/api/v3/resources/description', {
    method: 'POST',
    body: {
      id: resourceId,
      description: description
    }
  }).then(() => {
    infoSelection.value.description = description
    descriptionEditMode.value = false
    toast({
      description: h('div',
          {class: 'flex space-x-2 items-center justify-center text-aruna-text-accent'},
          [
            h(IconCheck, {class: 'flex-shrink-0 size-6 text-aruna-highlight'}),
            h('span',
                {class: 'text-fuchsia-50'},
                ['Description successfully updated.'])
          ]),
      duration: 5000
    })
  }).catch(error => {
    toast({
      title: 'Error',
      //description: 'Something went wrong. If this problem persists please contact an administrator.',
      description: `Failed to update description: ${error.data.message}`,
      variant: 'destructive',
      duration: 10000,
    })
  })
}
</script>
<template>
  <div class="flex flex-col h-full w-full">
    <!-- Header -->
    <div class="flex p-4 h-14 items-center justify-between px-6 bg-transparent border-b border-aruna-text/50">
      <nav aria-label="breadcrumb">
        <Breadcrumb>
          <BreadcrumbList class="font-bold text-aruna-text-accent">
            <BreadcrumbItem @click="navigateBack('root')"
                            class="hover:cursor-pointer">
              Your Projects
            </BreadcrumbItem>
            <div v-for="resource in currentHierarchy"
                 class="flex items-center justify-center gap-2.5">
              <BreadcrumbSeparator/>
              <BreadcrumbItem v-if="resource.variant !== ResourceVariant.Object"
                              @click="navigateBack(resource.id)"
                              class="hover:cursor-pointer">
                {{ !resource.deleted ? resource.name : 'DELETED' }}
              </BreadcrumbItem>
              <BreadcrumbItem v-else>
                {{ !resource.deleted ? resource.name : 'DELETED' }}
              </BreadcrumbItem>
            </div>
          </BreadcrumbList>
        </Breadcrumb>
      </nav>

      <!-- Action Buttons -->
      <div class="flex items-center gap-4">
        <!--<Select v-model:model-value="pageSize">-->
        <Select @update:modelValue="(v) => pageSize = parseInt(v)" :default-value="3">
          <SelectTrigger class="w-[180px]">
            <SelectValue>Page size: {{ pageSize }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Page Size</SelectLabel>
              <SelectItem v-for="size in ['3','5','10','15','25','50','100']" :value="size">{{ size }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Button key="create"
                @click="emitTabSwitch('ResourceCreation')"
                class="inline-flex w-fit bg-transparent text-aruna-highlight border border-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
          <IconPlus class="h-4 w-4 mr-2"/>
          Create
        </Button>
      </div>
      <!-- End Action Buttons -->
    </div>
    <!-- End Header -->

    <!-- Pagination -->
    <div class="my-2 flex">
      <Pagination v-if="currentHierarchy.length > 0 && totalHits > pageSize"
                  v-slot="{ page }"
                  :total="totalHits"
                  :items-per-page="pageSize"
                  :sibling-count="1"
                  :default-page="1"
                  show-edges>
        <PaginationList v-slot="{ items }" class="flex items-center gap-1">
          <PaginationFirst class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>
          <PaginationPrev class="w-8 h-8 p-0 rounded-sm border-aruna-text bg-aruna-bg"/>

          <template v-for="(item, index) in items">
            <PaginationListItem v-if="item.type === 'page'"
                                :key="index"
                                :value="item.value"
                                class="rounded-sm"
                                as-child>
              <Button class="w-9 h-9 p-0"
                      :variant="item.value === page ? 'default' : 'outline'"
                      @click="currentPage = item.value">
                {{ item.value }}
              </Button>
            </PaginationListItem>
            <PaginationEllipsis v-else :key="item.type" :index="index"/>
          </template>

          <PaginationNext/>
          <PaginationLast/>
        </PaginationList>
      </Pagination>
    </div>
    <!-- End Pagination -->

    <ResizablePanelGroup id="file-explorer-list"
                         :direction="checkDirection()"
                         class="h-full">
      <ResizablePanel>
        <!-- Flexbox Resource Display -->
        <div class="flex flex-row flex-wrap content-start items-start justify-start gap-6 ms-4 my-4">
          <Card v-for="resource in displayedResources"
                class="rounded-sm border-aruna-text/50 flex flex-col items-center justify-center min-w-[200px] max-w-[300px] h-fit">
            <CardContent class="p-0 flex flex-col items-center w-full">
              <div class="w-full flex gap-x-2">
                <div class="group flex flex-col grow py-4 ps-4 items-center justify-center"
                     @dblclick="navigateForward(resource)">
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
            <CardContent class="py-0">
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
      <ResizablePanel v-if="infoOpen" id="file-explorer-sidebar"
                      :default-size="25"
                      :min-size="25"
                      :max-size="50">
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

            <Separator class="bg-aruna-text/50 my-4"/>

            <Label for="description">Description</Label>
            <Textarea id="description"
                      :rows="3"
                      placeholder="Here you can enter a description of your resource"
                      class="py-3 px-4 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                   focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                   focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                   disabled:opacity-50 disabled:pointer-events-none"/>

            <div class="flex sm:flex-col w-full gap-y-1">
              <KeyValueDialog :initial-open="false"
                              :with-button="true"
                              button-css="w-fit"
                              button-label="Add Label"
                              @add-key-value="(v: KeyValue) => fileLabels.set(v.key, v)"/>

              <div class="p-1 gap-2 flex flex-wrap items-center">
                <div v-for="[key, label] in fileLabels" class="h-fit flex justify-center">
                  <span class="flex justify-center items-center rounded-s-sm border border-aruna-highlight">
                    <IconLock v-if="label.locked" class="m-0.5 flex-shrink-0 size-5"/>
                    <IconLockOpen2 v-else class="m-0.5 flex-shrink-0 size-5"/>
                  </span>
                  <span class="flex justify-center px-1 items-center border border-aruna-highlight text-sm text-aruna-highlight">
                        {{ key }}
                      </span>
                  <span v-if="label.value"
                        class="flex justify-center px-1 items-center max-w-48 text-sm truncate overflow-ellipsis border border-aruna-highlight bg-aruna-highlight text-aruna-text-accent">
                    {{ label.value }}
                  </span>
                  <span class="group flex justify-center items-center rounded-e-sm border border-aruna-highlight hover:cursor-pointer">
                    <Button variant="ghost"
                            class="h-fit px-2 py-0 hover:bg-transparent"
                            @click="fileLabels.delete(label.key)">
                  <IconX class="flex-shrink-0 size-4 text-aruna-text group-hover:text-destructive"/>
                </Button>
                  </span>
                </div>
              </div>
            </div>

            <div class="flex sm:flex-col w-fit gap-y-4">
              <Label for="authors">Authors</Label>
              <AuthorDialog :initial-open="false"
                            :with-button="true"
                            button-css="w-fit"
                            @add-author="(v: Author) => fileAuthors.set(`${v.email}`, v)"/>

              <ul v-if="fileAuthors.size > 0" class="ps-6 list-disc">
                <li v-for="[key, author] in fileAuthors" class="text-aruna-text">
                  {{ author.first_name }} {{ author.last_name }} | {{ author.email }}
                </li>
              </ul>
            </div>

            <Label for="license">License</Label>
            <Select :default-value="props.licenses[0].id"
                    @update:model-value="(v) => fileLicense = v">
              <SelectTrigger class="bg-aruna-muted w-full max-w-[450px]">
                <SelectValue placeholder="Select a license for your resource"/>
              </SelectTrigger>
              <SelectContent class="bg-aruna-bg/90 truncate overflow-ellipsis">
                <SelectGroup>
                  <SelectItem v-for="license in props.licenses" :value="license.id"
                              class="hover:bg-aruna-fg">
                    {{ license.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div v-else-if="infoSelection" class="gap-y-4">
            <div class="flex items-center justify-between">
              <div class="flex w-full items-center">
                <!-- Locked / Unlocked -->
                <TooltipProvider :delay-duration="500">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <IconLock v-if="infoSelection?.locked" class="me-4 text-destructive"/>
                      <IconLockOpen2 v-else class="me-4 text-aruna-highlight"/>
                    </TooltipTrigger>
                    <TooltipContent class="rounded-none text-aruna-highlight bg-aruna-muted border border-aruna-text/50">
                      <span v-if="infoSelection?.locked">This resource is locked and cannot be edited.</span>
                      <span v-else>This resource is still editable.</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <!-- End Locked / Unlocked -->
                <!-- Name / Title -->
                <EditableLabel v-model:edit-mode="titleEditMode"
                               @dblclick="titleEditMode = true"
                               @updated-value="updateTitle"
                               :resourceId="infoSelection?.id"
                               :text="infoSelection?.title || 'Title not available'"
                               text-css="text-2xl text-aruna-text-accent"
                               :multiline="false"/>
                <!--<h2 class="ms-4 text-2xl">{{ infoSelection?.title || 'Title not available' }}</h2>-->
                <!-- End Name / Title -->
              </div>
              <!-- Link to resource landing page -->
              <NuxtLink :to="`/objects/${infoSelection?.id}`" target="_blank">
                <IconExternalLink class="ms-4 flex-shrink-0 text-aruna-text-accent hover:text-aruna-highlight"/>
              </NuxtLink>
              <!-- End Link to resource landing page -->
            </div>
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
              <ScrollBar orientation="horizontal"/>
            </ScrollArea>

            <Table class="table-auto">
              <TableBody class="">
                <TableRow>
                  <TableCell class="w-[125px] text-sm font-medium leading-6 text-aruna-text-accent">
                    Id:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ infoSelection?.id || '' }}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Name:</TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    <EditableLabel v-model:edit-mode="nameEditMode"
                                   @dblclick="nameEditMode = true"
                                   @updated-value="updateName"
                                   :resourceId="infoSelection?.id"
                                   :text="infoSelection?.name"
                                   :multiline="false"/>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="align-text-top text-sm font-medium leading-6 text-aruna-text-accent">
                    Description:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    <EditableLabel v-model:edit-mode="descriptionEditMode"
                                   @dblclick="descriptionEditMode = true"
                                   @updated-value="updateDescription"
                                   :resourceId="infoSelection?.id"
                                   :text="infoSelection?.description"
                                   :multiline="true"/>
                  </TableCell>
                </TableRow>
                <TableRow v-if="infoSelection?.variant === ResourceVariant.Object">
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">Size:</TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ formatBytes(infoSelection?.content_len || 0) }}
                  </TableCell>
                </TableRow>
                <TableRow v-else>
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">
                    Children:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ infoSelection?.count || 0 }}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">
                    Created At:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ formatDate(infoSelection?.created_at || 'N/A') }}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">
                    Last Modified:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ formatDate(infoSelection?.last_modified || 'N/A') }}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="text-sm font-medium leading-6 text-aruna-text-accent">
                    License:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    {{ licenseMap.get(infoSelection?.license_id)?.name || 'N/A' }}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell class="text-sm align-text-top font-medium leading-6 text-aruna-text-accent">
                    Locations:
                  </TableCell>
                  <TableCell class="mt-1 ps-4 text-sm leading-6 text-aruna-text sm:col-span-2 sm:mt-0">
                    <ul v-if="infoSelection?.location.length > 0" class="list-disc">
                      <li class="flex gap-x-2" v-for="loc in infoSelection?.location">
                        <component :is="StatusMap[loc.status as keyof typeof StatusMap]"
                                   :class="{'text-aruna-text-accent animate-spin': loc.status === SyncingStatus.Pending,
                                          'text-aruna-text-accent': loc.status === SyncingStatus.Running,
                                          'text-green-600': loc.status === SyncingStatus.Finished,
                                          'text-destructive': loc.status === SyncingStatus.Error}"/>
                        {{ loc.endpoint_id }}
                      </li>
                    </ul>
                    <span v-else>N/A</span>
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

          <div class="flex justify-between">
            <div class="flex gap-x-2">
              <Button v-if="fileUpload"
                      variant="outline"
                      @click="submitUpload"
                      class="inline-flex w-fit bg-transparent text-aruna-highlight border border-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
                Upload
              </Button>
              <Button variant="outline"
                      @click="closeInfo"
                      class="inline-flex w-fit bg-transparent text-aruna-text border border-aruna-text hover:bg-aruna-h hover:text-aruna-text-accent hover:border-aruna-text-accent">
                Close
              </Button>
            </div>
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
