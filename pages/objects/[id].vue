<script setup lang="ts">
import {
  IconArrowsSplit,
  IconBucket,
  IconCheck,
  IconChevronDown,
  IconCloudDown,
  IconCloudLock,
  IconEdit,
  IconExternalLink,
  IconFileInfo,
  IconFileSignal,
  IconLeaf,
  IconLicense,
  IconLockCog,
  IconTag,
  IconUsers,
  IconWebhook,
  IconZoomCheck
} from '@tabler/icons-vue';
import {
  modelsv2Status,
  v2DataClass,
  v2EndpointHostVariant,
  v2InternalRelationVariant,
  v2PermissionLevel,
  v2RelationDirection,
  v2ResourceVariant,
  type v2UpdateProjectDescriptionResponse,
} from "~/composables/aruna_api_json";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl,} from "@aws-sdk/s3-request-presigner";
import {fetchEndpoint, getPublicResourceUrl} from "~/composables/api_wrapper";
import {
  getChildResourceType,
  toDataClassStr,
  toObjectStatusStr,
  toPermissionTypeStr,
  toResourceTypeStr
} from "~/composables/enum_conversions";
import {ResourceInfo} from "~/composables/ResourceInfo";
import {useToast} from '~/components/ui/toast/use-toast'

const {toast} = useToast()


interface ResourceInfoResponse extends Response {
  resource: ResourceInfo
  jsonLd: Object
}

const resourceId = useRoute().params.id as string
const loading: Ref<boolean> = ref(true)
const {resource, jsonLd}: ResourceInfoResponse = await $fetch<ResourceInfoResponse>('/api/resource-info', {
  query: {
    resourceId: resourceId,
    noLicenseText: true
  }
}).then((response: ResourceInfoResponse) => {
  loading.value = false
  return response
})
const incomingRelations = computed(() => resource.relations.filter(rel => rel.internal &&
    rel.internal.definedVariant !== v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED &&
    rel.internal.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND).map(rel => rel.internal))
const outgoingRelations = computed(() => resource.relations.filter(rel => rel.internal &&
    rel.internal.definedVariant !== v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED &&
    rel.internal.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND).map(rel => rel.internal))
const externalRelations = computed(() => resource.relations.filter(rel => rel.external).map(rel => rel.external))

// ----- Editable Description ---------------
const editDescription = ref<boolean>(false)
const descriptionBackup = ref(resource.description)

function isEditable(): boolean {
  if (resource) {
    return [v2PermissionLevel.PERMISSION_LEVEL_ADMIN,
          v2PermissionLevel.PERMISSION_LEVEL_WRITE].includes(resource.permission) &&
        resource.variant !== v2ResourceVariant.RESOURCE_VARIANT_OBJECT
  }
  return false
}

async function updateDescription(description: string) {
  console.info('[LandingPage] Updated description:', description)
  if (resource) {
    let apiEndpoint = undefined
    switch (resource.variant) {
      case v2ResourceVariant.RESOURCE_VARIANT_PROJECT:
        apiEndpoint = `/api/project/${resource.id}/description`
        break
      case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION:
        apiEndpoint = `/api/collection/${resource.id}/description`
        break
      case v2ResourceVariant.RESOURCE_VARIANT_DATASET:
        apiEndpoint = `/api/dataset/${resource.id}/description`
        break
    }

    // Show error if somehow this gets called for an Object
    if (!apiEndpoint) {
      toast({
        title: 'Error',
        //description: 'Something went wrong. If this problem persists please contact an administrator.',
        description: `Title editing for the current resource is not yet implemented.`,
        variant: 'destructive',
        duration: 10000,
      })
      return
    }

    //const apiEndpoint = `/api/${toResourceTypeStr(resource.variant).toLowerCase()}/${resource.id}/description`
    console.info('[LandingPage] Call API endpoint:', apiEndpoint)
    await $fetch<v2UpdateProjectDescriptionResponse>(apiEndpoint, {
      method: 'PATCH',
      body: {
        description: description,
      }
    }).then(response => {
      toast({
        description: h('div',
            {class: 'flex space-x-2 items-center justify-center text-aruna-text-accent'},
            [
              h(IconCheck, {class: 'flex-shrink-0 size-6 text-aruna-highlight'}),
              h('span',
                  {class: 'text-fuchsia-50'},
                  ['Successfully updated the description.'])
            ]),
        duration: 5000
      })
      descriptionBackup.value = description
      editDescription.value = false
    }).catch(error => {
      console.error(error)
      toast({
        title: 'Error',
        //description: 'Something went wrong. If this problem persists please contact an administrator.',
        description: `Failed to update description: ${error.data.message}`,
        variant: 'destructive',
        duration: 10000,
      })
    })
  }
}

function cancelDescriptionEdit() {
  resource.description = descriptionBackup.value
  editDescription.value = false
}

function isDownloadable(): boolean {
  if (resource) {
    return (resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT &&
            resource.dataClass === v2DataClass.DATA_CLASS_PUBLIC &&
            resource.objectStatus === modelsv2Status.STATUS_AVAILABLE) ||
        (resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT &&
            resource.objectStatus === modelsv2Status.STATUS_AVAILABLE &&
            ![v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED,
              v2PermissionLevel.PERMISSION_LEVEL_NONE].includes(resource.permission))
  }
  return false
}

function canCreateChild(level: v2PermissionLevel): boolean {
  return level == v2PermissionLevel.PERMISSION_LEVEL_ADMIN
      || level == v2PermissionLevel.PERMISSION_LEVEL_WRITE
      || level == v2PermissionLevel.PERMISSION_LEVEL_APPEND;
}

function canCreateMetafile(level: v2PermissionLevel): boolean {
  return level == v2PermissionLevel.PERMISSION_LEVEL_ADMIN
      || level == v2PermissionLevel.PERMISSION_LEVEL_WRITE;
}

async function downloadResource(endpointId?: string) {
  if (resource) {
    if (typeof endpointId === "undefined") {
      endpointId = resource.endpoints[0].id
    }
    if (resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT) {
      if (resource.dataClass === v2DataClass.DATA_CLASS_PUBLIC) {
        //TODO: Choose nearest endpoint from object locations
        const endpoint = await fetchEndpoint(endpointId)
        const data_module = endpoint?.hostConfigs?.find(conf => conf.hostVariant === v2EndpointHostVariant.ENDPOINT_HOST_VARIANT_S3)

        if (data_module?.url) {
          // Create unsigned url and get object
          const data_host = data_module.url.replace(/(^\w+:|^)\/\//, '');
          await getPublicResourceUrl(data_host, resource, data_module.url.startsWith('https')).then(download_url => {
            // create element <a> for download ...
            const link = document.createElement('a');
            link.href = download_url;
            link.target = '_blank';
            link.download = resource.name;
            link.click();
          })
        }
      } else {
        const download_url = await getDownloadUrl(resource.id)
        // create element <a> for download ... lolmao
        const link = document.createElement('a')
        link.href = download_url.url
        link.target = '_blank'
        link.download = `${resource.name}.tar.gz`

        console.log(link)
        link.click();
      }
    } else {
      // Create presigned download url for temp bundle
      //TODO: Evaluate "nearest" DataProxy
      // Fetch S3 credentials (includes host url)
      const creds = await getUserS3Credentials(endpointId)
      // Create S3 client and pre-sign url
      const client = new S3Client({
        endpoint: creds.s3EndpointUrl ? creds.s3EndpointUrl : '',
        region: 'region-one',
        credentials: {
          accessKeyId: creds.s3AccessKey ? creds.s3AccessKey : '',
          secretAccessKey: creds.s3SecretKey ? creds.s3SecretKey : ''
        }
      });
      const command = new GetObjectCommand({
        Bucket: 'objects',
        Key: `${resource.id}/${resource.name}.tar.gz`
      })
      const download_url = await getSignedUrl(client, command, {expiresIn: 3600})

      // create element <a> for download ... lolmao
      const link = document.createElement('a')
      link.href = download_url
      link.target = '_blank'
      link.download = `${resource.name}.tar.gz`

      console.log(link)
      link.click();
    }
  }
}

async function find_parent(): Promise<string | undefined> {
  if (resource) {
    if (resource.variant == v2ResourceVariant.RESOURCE_VARIANT_PROJECT) {
      if (canCreateChild(resource.permission)) {
        return resource.id
      }
    } else {
      for (const relation of resource.relations) {
        if (!relation.internal) {
          continue;
        }
        if (relation.internal.definedVariant !== v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO) {
          continue;
        }
        if (relation.internal.direction !== v2RelationDirection.RELATION_DIRECTION_INBOUND) {
          continue;
        }
        let parentResource = await fetchResource(relation.internal.resourceId);
        if (!canCreateChild(resource.permission)) {
          continue
        }
        return relation.internal.resourceId;
      }
    }
  }
  return undefined
}


const metadataParentId = await find_parent()
const enableCreateMetafile = resource && canCreateMetafile(resource.permission)
const enableCreateChild = resource && canCreateChild(resource.permission)

useHead({
  script: [{id: resource.id, type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd, null, 2)}]
}, {
  mode: 'server'
})
</script>

<template>
  <NavigationTop/>

  <!-- Nav + Margin + Footer = 218px -->
  <div v-if="!loading && resource" class="min-h-[calc(100vh-110px)]">
    <!-- Badge Row -->
    <div class="flex flex-wrap justify-center max-w-screen-2xl mx-auto my-10">
      <ul class="flex flex-col flex-wrap grow sm:flex-row">
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconBucket class="flex-shrink-0 size-6"/>
          <span class="font-bold">Type:</span>
          <span class="text-aruna-text">{{ toResourceTypeStr(resource.variant) }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconLockCog class="flex-shrink-0 size-6"/>
          <span class="font-bold">Dataclass:</span>
          <span class="text-aruna-text">{{ toDataClassStr(resource.dataClass) }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconZoomCheck class="flex-shrink-0 size-6"/>
          <span class="font-bold">Status:</span>
          <span class="text-aruna-text">{{ toObjectStatusStr(resource.objectStatus) }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">Metadata License:</span>
          <span class="text-aruna-text">{{ resource.metaLicense.name }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">
            {{
              resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT ? '' : 'Default'
            }} Data License:</span>
          <span class="text-aruna-text">{{ resource.dataLicense.name }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <IconCloudLock class="flex-shrink-0 size-6"/>
          <span class="font-bold">Permission:</span>
          <span class="text-aruna-text">{{ toPermissionTypeStr(resource.permission) }}</span>
        </li>
        <li class="inline-flex grow items-center bg-aruna-bg/90 gap-x-1 py-3 px-4 text-sm font-medium border border-aruna-text/50 text-aruna-text-accent -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-sm sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-sm sm:last:rounded-es-none sm:last:rounded-se-sm">
          <!-- Actions Dropdown Menu -->
          <div class="hs-dropdown relative inline-flex">
            <button id="hs-dropdown-with-icons" type="button"
                    class="hs-dropdown-toggle inline-flex items-center gap-x-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none text-white">
              Actions
              <IconChevronDown class="hs-dropdown-open:rotate-180 size-4"/>
            </button>

            <div aria-labelledby="hs-dropdown-with-icons"
                 class="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 shadow-md rounded-md p-2 mt-2 divide-y bg-aruna-bg/90 border-aruna-text/50 border divide-neutral-700">
              <div class="py-2 first:pt-0 last:pb-0">
                <ClientOnly>
                  <button v-if="resource.variant == v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                          type="button"
                          @click="downloadResource()"
                          :disabled="!isDownloadable()"
                          title="Download Object"
                          class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg hover:text-aruna-text-accent focus:outline-none focus:bg-aruna-fg focus:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none">
                    <IconCloudDown class="flex-shrink-0 size-4"/>
                    Download
                  </button>
                  <NuxtLink
                      :to="enableCreateMetafile ? {path:'/objects/create', query: {type: toResourceTypeStr(v2ResourceVariant.RESOURCE_VARIANT_OBJECT), class: toDataClassStr(resource.dataClass), relId: resource.id, relType: toResourceTypeStr(resource.variant), parentId: metadataParentId}} : null"
                      class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg hover:text-aruna-text-accent focus:outline-none focus:bg-aruna-fg focus:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none"
                      :class="{'disabled-link': !enableCreateMetafile}">
                    <IconFileSignal class="flex-shrink-0 size-4"/>
                    Create Meta File
                  </NuxtLink>
                  <NuxtLink v-if="resource.variant != v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                            :to="enableCreateChild ? {path:'/objects/create', query: {type: toResourceTypeStr(getChildResourceType(resource.variant)), class: toDataClassStr(resource.dataClass), parentId: resource.id }} : null"
                            class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-aruna-text hover:bg-aruna-fg hover:text-aruna-text-accent focus:outline-none focus:bg-aruna-fg focus:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none"
                            :class="{'disabled-link': !enableCreateChild}">
                    <IconLeaf class="flex-shrink-0 size-4"/>
                    Create Child Resource
                  </NuxtLink>
                </ClientOnly>
              </div>
            </div>
          </div>
          <!-- End Actions Dropdown Menu -->
        </li>
      </ul>
    </div>
    <!-- End Badge Row -->

    <!-- General Info Row -->
    <div class="flex flex-wrap justify-between gap-x-6 gap-y-2 max-w-screen-2xl mx-auto mb-6">
      <CardSmallInfo :icon_id='"ID"' :text="resource.id"/>
      <CardName :name="resource.name" :title="resource.title"/>
      <CardStats :stats="resource.stats"/>
    </div>
    <!-- End General Info Row -->

    <!-- Description / Authors Row -->
    <div class="flex flex-col xl:flex-row justify-center gap-x-4 gap-y-2 max-w-screen-2xl mx-auto mb-6">
      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-between items-center p-4 font-bold text-xl">
          <div class="flex flex-row w-fit">
            <IconFileInfo class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
            <span class="">Description</span>
          </div>
          <IconEdit v-if="isEditable()" @click="editDescription = true"/>
        </div>
        <div v-if="editDescription" class="flex flex-col gap-2">
          <Textarea v-model="resource.description"
                    :rows="5"
                    class="py-3 px-4 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                   focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                   focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                   disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
          <div class="flex gap-4">
            <Button @click="updateDescription(resource.description)"
                    variant="outline"
                    class="w-fit bg-transparent border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
              Save
            </Button>
            <Button @click="cancelDescriptionEdit()" variant="outline" class="w-fit border-aruna-text text-aruna-text">
              Cancel
            </Button>
          </div>
        </div>
        <div v-else class="flex grow p-4 bg-aruna-bg/90 text-aruna-text text-lg border-t border-aruna-text/50">
          <pre class="w-full">{{ resource?.description }}</pre>
        </div>
      </div>
      <div v-if="resource.authors"
           class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconUsers class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Authors</span>
        </div>
        <CardAuthors :authors="resource.authors"/>
      </div>
    </div>
    <!-- End Description / Authors Row -->

    <!-- Labels / Hooks Row -->
    <div class="flex flex-wrap justify-between gap-x-4 gap-y-2 max-w-screen-2xl mx-auto mb-6">
      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconTag class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Labels</span>
        </div>
        <CardLabels :key_values="resource.keyValues"/>
      </div>

      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconWebhook class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Hooks</span>
        </div>
        <CardHooks :key_values="resource.keyValues"/>
      </div>
    </div>
    <!-- End Labels / Hooks Row -->

    <!-- Relations Row -->
    <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 max-w-screen-2xl mx-auto mb-6">
      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconExternalLink class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">External Relations</span>
        </div>
        <CardExternalRelations :relations="externalRelations"/>
      </div>

      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconCloudDown class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Locations</span>
        </div>
        <CardDownloads :endpoints="resource?.endpoints" :resource-type="resource.variant" @download="downloadResource"/>
      </div>
    </div>
    <!-- End Relations Row -->

    <!-- Locations -->
    <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 max-w-screen-2xl mx-auto mb-6">
      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconArrowsSplit class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Incoming Relations</span>
        </div>
        <CardInternalRelations :relations="incomingRelations"/>
      </div>

      <div class="flex flex-col grow p-2 bg-aruna-bg/90 border border-aruna-text/50 text-aruna-text-accent">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconArrowsSplit class="flex-shrink-0 size-6 me-4 text-aruna-highlight"/>
          <span class="">Outgoing Relations</span>
        </div>
        <CardInternalRelations :relations="outgoingRelations"/>
      </div>
    </div>
    <!-- End Locations -->
  </div>

  <div v-else-if="loading">
    class="flex flex-wrap justify-center container mx-auto mb-6">
    <div
        class="animate-spin inline-flex size-8 border-[3px] border-current border-t-transparent text-aruna-800 rounded-full"
        role="status"
        aria-label="loading">
      <span class="sr-only">Loading...</span>
    </div>
  </div>

  <div v-else class="">
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      Could not load resource: {{ resourceId }}
    </div>
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      {{ resource === undefined }}
    </div>
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      {{ loading }}
    </div>
  </div>

  <Footer/>
</template>