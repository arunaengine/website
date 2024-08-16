<script setup lang="ts">
import {
  IconArrowLeft,
  IconArrowsSplit,
  IconBucket,
  IconChevronDown,
  IconCloudDown,
  IconCloudLock,
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
  v2PermissionLevel,
  v2ResourceVariant,
  v2InternalRelationVariant,
  v2RelationDirection,
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

interface ResourceInfoResponse extends Response {
  resource: ResourceInfo
  jsonLd: Object
}

const router = useRouter() // Used for back link
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

  <div class="flex flex-wrap justify-between container mx-auto mt-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white my-4">
      Resource Overview
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div v-if="!loading && resource">
    <!-- Badge Row -->
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      <ul class="flex flex-col flex-wrap grow sm:flex-row">
        <li class="inline-flex items-center bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconBucket class="flex-shrink-0 size-6"/>
          <span class="font-bold">Type:</span> {{ toResourceTypeStr(resource.variant) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLockCog class="flex-shrink-0 size-6"/>
          <span class="font-bold">Dataclass:</span> {{ toDataClassStr(resource.dataClass) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconZoomCheck class="flex-shrink-0 size-6"/>
          <span class="font-bold">Status:</span> {{ toObjectStatusStr(resource.objectStatus) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">Metadata License:</span> {{ resource.metaLicense.name }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">
            {{
              resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT ? '' : 'Default'
            }} Data License:</span> {{ resource.dataLicense.name }}
        </li>

        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconCloudLock class="flex-shrink-0 size-6"/>
          <span class="font-bold">Permission:</span> {{ toPermissionTypeStr(resource.permission) }}
        </li>

        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <!-- Actions Dropdown Menu -->
          <div class="hs-dropdown relative inline-flex">
            <button id="hs-dropdown-with-icons" type="button"
                    class="hs-dropdown-toggle inline-flex items-center gap-x-2 text-sm font-medium rounded-md text-gray-800 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-900 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-800">
              Actions
              <IconChevronDown class="hs-dropdown-open:rotate-180 size-4"/>
            </button>

            <div
                class="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 bg-white shadow-md rounded-md p-2 mt-2 divide-y divide-gray-200 dark:bg-neutral-800 dark:border dark:border-neutral-700 dark:divide-neutral-700"
                aria-labelledby="hs-dropdown-with-icons">
              <div class="py-2 first:pt-0 last:pb-0">
                <ClientOnly>
                  <button v-if="resource.variant == v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                          type="button"
                          @click="downloadResource()"
                          :disabled="!isDownloadable()"
                          title="Download Object"
                          class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700 disabled:opacity-50 disabled:pointer-events-none">
                    <IconCloudDown class="flex-shrink-0 size-4"/>
                    Download
                  </button>
                  <NuxtLink
                      :to="enableCreateMetafile ? {path:'/objects/create', query: {type: toResourceTypeStr(v2ResourceVariant.RESOURCE_VARIANT_OBJECT), class: toDataClassStr(resource.dataClass), relId: resource.id, relType: toResourceTypeStr(resource.variant), parentId: metadataParentId}} : null"
                      class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700"
                      :class="{'disabled-link': !enableCreateMetafile}">
                    <IconFileSignal class="flex-shrink-0 size-4"/>
                    Create Meta File
                  </NuxtLink>
                  <NuxtLink v-if="resource.variant != v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                            :to="enableCreateChild ? {path:'/objects/create', query: {type: toResourceTypeStr(getChildResourceType(resource.variant)), class: toDataClassStr(resource.dataClass), parentId: resource.id }} : null"
                            class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700"
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
    <div class="flex flex-wrap justify-between gap-x-6 gap-y-2 container mx-auto mb-6">
      <CardSmallInfo :icon_id='"ID"' :text="resource.id"/>
      <CardName :name="resource.name" :title="resource.title"/>
      <CardStats :stats="resource.stats"/>
    </div>
    <!-- End General Info Row -->

    <!-- Description / Authors Row -->
    <div class="flex flex-col xl:flex-row justify-center gap-x-4 gap-y-2 container mx-auto mb-6">
      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconFileInfo class="flex-shrink-0 size-6 me-4"/>
          <span class="">Description</span>
        </div>
        <div
            class="flex grow p-4 text-gray-700 text-xl border-t border-gray-300 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
          {{ resource?.description }}
        </div>
      </div>
      <div v-if="resource.authors"
           class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconUsers class="flex-shrink-0 size-6 me-4"/>
          <span class="">Authors</span>
        </div>
        <CardAuthors :authors="resource.authors"/>
      </div>
    </div>
    <!-- End Description / Authors Row -->

    <!-- Labels / Hooks Row -->
    <div class="flex flex-wrap justify-between gap-x-4 gap-y-2 container mx-auto mb-6">
      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconTag class="flex-shrink-0 size-6 me-4"/>
          <span class="">Labels</span>
        </div>
        <CardLabels :key_values="resource.keyValues"/>
      </div>

      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconWebhook class="flex-shrink-0 size-6 me-4"/>
          <span class="">Hooks</span>
        </div>
        <CardHooks :key_values="resource.keyValues"/>
      </div>
    </div>
    <!-- End Labels / Hooks Row -->

    <!-- Relations Row -->
    <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 container mx-auto mb-6">
      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconExternalLink class="flex-shrink-0 size-6 me-4"/>
          <span class="">External Relations</span>
        </div>
        <CardRelations :relations="resource?.relations" :external="true"/>
      </div>

      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconArrowsSplit class="flex-shrink-0 size-6 me-4"/>
          <span class="">Internal Relations</span>
        </div>
        <CardRelations :relations="resource?.relations" :external="false"/>
      </div>
    </div>
    <!-- End Relations Row -->

    <!-- Locations -->
    <div v-if="resource.variant == v2ResourceVariant.RESOURCE_VARIANT_OBJECT" class="flex flex-wrap justify-center gap-x-4 gap-y-2 container mx-auto mb-6">
      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconCloudDown class="flex-shrink-0 size-6 me-4"/>
          <span class="">Locations</span>
        </div>
        <CardDownloads :endpoints="resource?.endpoints" @download="downloadResource"/>
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