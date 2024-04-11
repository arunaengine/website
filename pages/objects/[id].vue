<script setup lang="ts">
import {IconArrowLeft, IconArrowsSplit, IconExternalLink, IconFileInfo, IconTag, IconWebhook} from '@tabler/icons-vue';
import {v2ResourceVariant} from "~/composables/aruna_api_json";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

const route = useRoute()
const objectInfo = await useFetch(`/api/resource?resourceId=${route.params.id}`)
    .then(res => {
      const resource = res.data.value
      if (resource) {
        try {
          return toObjectInfo(resource.resource, resource.permission)
        } catch (error) {
          console.log(error)
        }
      }
      return undefined
    }, error => {
      console.log(error)
      return undefined
    })

async function downloadResource() {
  if (objectInfo) {
    if (objectInfo.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT) {
      let downloadUrl = await getDownloadUrl(objectInfo.id)
      if (downloadUrl.url) {
        // create element <a> for download ... lolmao
        const link = document.createElement('a');
        link.href = downloadUrl.url;
        link.target = '_blank';
        link.download = objectInfo.name;

        console.log(link)
        link.click();
/*
        // Simulate a click on the element <a>
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        */
      }
    } else {
      // Create unsigned download url
      //TODO: Evaluate "nearest" DataProxy
      let endpointId = objectInfo.endpoints[0]
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

  /*
  if (objectInfo) {
    //TODO: Choose "nearest" DataProxy
    let endpointId = objectInfo.endpoints[0]
    //TODO: Fetch S3 credentials (includes host url)
    const creds = await getUserS3Credentials(endpointId)
    //TODO: Create S3 client
    const client = new S3Client({
      endpoint: creds.s3EndpointUrl ? creds.s3EndpointUrl : '',
      region: 'region-one',
      credentials: {
        accessKeyId: creds.s3AccessKey ? creds.s3AccessKey : '',
        secretAccessKey: creds.s3SecretKey ? creds.s3SecretKey : ''
      }
    });

    //TODO: Get hierarchy
    const hierarchy = await getResourceHierarchy(objectInfo.id)

    //TODO: Create key from hierarchy
    const key = createS3Key(hierarchy.collection, hierarchy.dataset, objectInfo.name)

    //TODO: Send GetObjectCommand
    const command = new GetObjectCommand({
      Bucket: 'my',
      Key: undefined
    });
    const item = await client.send(command);
    item.Body.pipe(createWriteStream(fileName))
    //TODO: Download body as stream
  }
  */
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
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-blue-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-50 disabled:pointer-events-none dark:text-blue-500 dark:hover:bg-blue-800/30 dark:hover:text-blue-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <!-- Badge row -->
  <div class="flex flex-wrap container mx-auto mb-6">
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceType :variant="objectInfo?.variant"/>
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeDataclass :dataClass="objectInfo?.data_class" :outline="true"/>
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceStatus :status="objectInfo?.object_status"/>
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceLicense :license="objectInfo?.license" :meta="true"/>
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourceLicense :license="objectInfo?.license" :meta="false"/>
    </div>
    <div class="flex sm:flex-row md:flex-col">
      <BadgeResourcePermission :permission="objectInfo?.permission"/>
    </div>
  </div>
  <div class="flex flex-wrap container mx-auto mb-6">
    <div class="flex sm:flex-row md:flex-col">
      <button type="button"
              @click="downloadResource()"
              class="py-2 px-2 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-500 hover:border-blue-600 hover:text-blue-600 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600">
        Download
      </button>
    </div>
  </div>

  <div class="flex flex-wrap justify-between gap-x-6 gap-y-2 container mx-auto mb-6">
    <CardSmallInfo :icon_id='"ID"' :text="objectInfo?.id"/>
    <CardSmallInfo :icon_id='"Name"' :text="objectInfo?.name"/>
    <CardStats :stats="objectInfo?.stats"/>
  </div>

  <div class="flex items-center container mx-auto mb-6">
    <div
        class="flex flex-col grow p-2 bg-white/[.5] border border-gray-400 text-gray-600 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
      <div class="flex flex-row justify-start items-center p-4 font-bold text-2xl">
        <IconFileInfo class="flex-shrink-0 size-6 me-2 text-gray-600/[.75]"/>
        Description
      </div>

      <div
          class="flex grow p-4 text-gray-700 text-xl border-t border-gray-300 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400">
        {{ objectInfo?.description }}
      </div>
    </div>
  </div>

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
</template>