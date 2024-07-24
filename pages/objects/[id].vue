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
  IconReplace,
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
  type v2Relation
} from "~/composables/aruna_api_json";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl,} from "@aws-sdk/s3-request-presigner";
import {fetchEndpoint, fetchResource, getPublicResourceUrl} from "~/composables/api_wrapper";
import {getChildResourceType, toObjectStatusStr, toPermissionTypeStr, toResourceTypeStr} from "~/composables/enum_conversions";

const route = useRoute()
const resourceId = route.params.id as string

const objectInfo = await fetchResource(resourceId)
    .then(resource => {
      if (resource) {
        return toObjectInfo(resource.resource, resource.permission)
      }
    }).catch(error => {
      console.log(error.code)
      console.log(error.message)
    })

function isDownloadable(): boolean {
  if (objectInfo) {
    return (objectInfo.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT &&
            objectInfo.data_class === v2DataClass.DATA_CLASS_PUBLIC &&
            objectInfo.object_status === modelsv2Status.STATUS_AVAILABLE) ||
        (objectInfo.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT &&
            objectInfo.object_status === modelsv2Status.STATUS_AVAILABLE &&
            ![v2PermissionLevel.PERMISSION_LEVEL_UNSPECIFIED,
              v2PermissionLevel.PERMISSION_LEVEL_NONE].includes(objectInfo.permission))
  }
  return false
}

async function downloadResource(endpointId?: string) {
  if (objectInfo) {
    if (typeof endpointId === "undefined") {
      endpointId = objectInfo.endpoints[0].id
    }
    if (objectInfo.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT) {
      if (objectInfo.data_class === v2DataClass.DATA_CLASS_PUBLIC) {
        //TODO: Choose nearest endpoint from object locations
        const endpoint = await fetchEndpoint(endpointId)
        const data_module = endpoint?.hostConfigs?.find(conf => conf.hostVariant === v2EndpointHostVariant.ENDPOINT_HOST_VARIANT_S3)

        if (data_module?.url) {
          // Create unsigned url and get object
          const data_host = data_module.url.replace(/(^\w+:|^)\/\//, '');
          await getPublicResourceUrl(data_host, objectInfo, data_module.url.startsWith('https')).then(download_url => {
            // create element <a> for download ...
            const link = document.createElement('a');
            link.href = download_url;
            link.target = '_blank';
            link.download = objectInfo.name;
            link.click();
          })
        }
      } else {
        const download_url = await getDownloadUrl(objectInfo.id)
        // create element <a> for download ... lolmao
        const link = document.createElement('a')
        link.href = download_url.url
        link.target = '_blank'
        link.download = `${objectInfo.name}.tar.gz`

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
        Key: `${objectInfo.id}/${objectInfo.name}.tar.gz`
      })
      const download_url = await getSignedUrl(client, command, {expiresIn: 3600})

      // create element <a> for download ... lolmao
      const link = document.createElement('a')
      link.href = download_url
      link.target = '_blank'
      link.download = `${objectInfo.name}.tar.gz`

      console.log(link)
      link.click();
    }
  }
}

function find_parent(relations: v2Relation[]): string | undefined {
  for (const relation of relations) {
    if (!relation.internal) {
      continue;
    }
    if (relation.internal.definedVariant !== v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO) {
      continue;
    }
    if (relation.internal.direction !== v2RelationDirection.RELATION_DIRECTION_INBOUND) {
      continue;
    }
    return relation.internal.resourceId;
  }
  return null;
}

/* Back link to last page in navigation history */
const router = useRouter()
</script>

<template>
  <NavigationTop/>

  <div class="flex flex-wrap justify-between container mx-auto mt-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white my-4">
      Overview Resource
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div v-if="objectInfo">
    <!-- Badge Row -->
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      <ul class="flex flex-col flex-wrap grow sm:flex-row">
        <li class="inline-flex items-center bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconBucket class="flex-shrink-0 size-6"/>
          <span class="font-bold">Type:</span> {{ toResourceTypeStr(objectInfo.variant) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLockCog class="flex-shrink-0 size-6"/>
          <span class="font-bold">Dataclass:</span> {{ toDataClassStr(objectInfo.data_class) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconZoomCheck class="flex-shrink-0 size-6"/>
          <span class="font-bold">Status:</span> {{ toObjectStatusStr(objectInfo.object_status) }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">Metadata License:</span> {{ objectInfo.license }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconLicense class="flex-shrink-0 size-6"/>
          <span class="font-bold">{{
              objectInfo.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT ? '' : 'Default'
            }} Data License:</span> {{ objectInfo.data_license }}
        </li>
        <li class="inline-flex items-center grow bg-white/[.5] gap-x-1 py-3 px-4 text-sm font-medium border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-neutral-900 dark:border-neutral-700 dark:text-white">
          <IconCloudLock class="flex-shrink-0 size-6"/>
          <span class="font-bold">Permission:</span> {{ toPermissionTypeStr(objectInfo.permission) }}
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
                <button v-if="objectInfo.variant == v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                        type="button"
                        @click="downloadResource()"
                        :disabled="!isDownloadable()"
                        title="Download Object"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700 disabled:opacity-50 disabled:pointer-events-none">
                  <IconCloudDown class="flex-shrink-0 size-4"/>
                  Download
                </button>
                <button type="button"
                        title="Replicate resource"
                        class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700">
                  <IconReplace class="flex-shrink-0 size-4"/>
                  Replicate
                </button>
                <NuxtLink :to="{path:'/objects/create', query: {relId: objectInfo.id, relType: toResourceTypeStr(objectInfo.variant), resourceType: toResourceTypeStr(v2ResourceVariant.RESOURCE_VARIANT_OBJECT), parentId: objectInfo.variant == v2ResourceVariant.RESOURCE_VARIANT_PROJECT ? objectInfo.id : find_parent(objectInfo.relations)}}"
                          class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700">
                  <IconFileSignal class="flex-shrink-0 size-4"/>
                  Create Meta File
                </NuxtLink>
                <NuxtLink v-if="objectInfo.variant != v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                          :to="{path:'/objects/create', query: {parentId: objectInfo.id, resourceType: toResourceTypeStr(getChildResourceType(objectInfo.variant)) }}"
                          class="flex items-center gap-x-3.5 py-2 px-3 rounded-md text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-300 dark:focus:bg-neutral-700">
                  <IconLeaf class="flex-shrink-0 size-4"/>
                  Create Child Resource
                </NuxtLink>
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
      <CardSmallInfo :icon_id='"ID"' :text="objectInfo.id"/>
      <CardName :name="objectInfo.name" :title="objectInfo.title"/>
      <CardStats :stats="objectInfo.stats"/>
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
          {{ objectInfo?.description }}
        </div>
      </div>
      <div v-if="objectInfo.authors"
           class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconUsers class="flex-shrink-0 size-6 me-4"/>
          <span class="">Authors</span>
        </div>
        <CardAuthors :authors="objectInfo.authors"/>
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
        <CardLabels :key_values="objectInfo?.key_values"/>
      </div>

      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconWebhook class="flex-shrink-0 size-6 me-4"/>
          <span class="">Hooks</span>
        </div>
        <CardHooks :key_values="objectInfo?.key_values"/>
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
        <CardRelations :relations="objectInfo?.relations" :external="true"/>
      </div>

      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconArrowsSplit class="flex-shrink-0 size-6 me-4"/>
          <span class="">Internal Relations</span>
        </div>
        <CardRelations :relations="objectInfo?.relations" :external="false"/>
      </div>
    </div>
    <!-- End Relations Row -->

    <!-- Locations -->
    <div v-if="isDownloadable()" class="flex flex-wrap justify-center gap-x-4 gap-y-2 container mx-auto mb-6">
      <div
          class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        <div class="flex flex-row justify-start items-center p-4 font-bold text-xl">
          <IconCloudDown class="flex-shrink-0 size-6 me-4"/>
          <span class="">Locations</span>
        </div>
        <CardDownloads :endpoints="objectInfo?.endpoints" @download="downloadResource"/>
      </div>
    </div>
    <!-- End Locations -->
  </div>
  <div v-else class="">
    <div class="flex flex-wrap justify-center container mx-auto mb-6">
      Could not load resource: {{ resourceId }}
    </div>
  </div>

  <Footer/>
</template>