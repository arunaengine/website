<script setup lang="ts">
import {IconArrowLeft, IconExclamationCircle, IconSquareRoundedPlus, IconTrash} from '@tabler/icons-vue'
import {
  v2DataClass,
  v2InternalRelationVariant,
  v2KeyValueVariant,
  v2RelationDirection,
  v2ResourceVariant,
  type v2Author,
  type v2DataEndpoint,
  type v2GetS3CredentialsUserTokenResponse,
  type v2KeyValue,
  type v2Object,
  type v2Project,
  type v2Relation,
} from '~/composables/aruna_api_json'

import {toRelationDirectionStr, toRelationVariantStr, toResourceTypeStr, fromResourceTypeStr} from "~/composables/enum_conversions"
import {OBJECT_REGEX, PROJECT_REGEX, S3_KEY_REGEX, ULID_REGEX} from "~/composables/constants"
import type {ObjectInfo} from "~/composables/proto_conversions"
import {deleteObject, getObjectBucketAndKey} from "~/composables/api_wrapper"
import EventBus from "~/composables/EventBus";

import {HeadObjectCommand, S3Client, type S3ClientConfig} from "@aws-sdk/client-s3";
import {Upload} from "@aws-sdk/lib-storage";

// Router to navigate back
const router = useRouter()
const route = useRoute()
const licenses = await fetchLicenses()

const createdResource: Ref<v2Project | undefined> = ref(undefined)
const creationError: Ref<string | undefined> = ref(undefined)

// ----- Query Parameter ----- //
function getParamSingle(param_name: string) {
  const value = route.query[param_name];
  if (Array.isArray(value)) {
    return value[0];
  } else if (typeof value === 'string') {
    return value;
  }
}

function setQueryParams() {
  if (route.query) {
    const resourceTypeParam = getParamSingle("resourceType");
    if (resourceTypeParam) {
      resourceType.value = fromResourceTypeStr(resourceTypeParam, v2ResourceVariant.RESOURCE_VARIANT_PROJECT);
    }
    const parentIdParam = getParamSingle("parentId");
    if (parentIdParam) {
      resourceParentId.value = parentIdParam;
    }
    const relIdParam = getParamSingle("relId");
    const relTypeParam = getParamSingle("relType");
    if (relIdParam && relTypeParam) {
      addRelation({
        internal: {
          resourceId: relIdParam,
          resourceVariant: fromResourceTypeStr(relTypeParam),
          definedVariant: v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA,
          direction: v2RelationDirection.RELATION_DIRECTION_OUTBOUND
        }
      } as v2Relation)
    }
  }
}
onMounted(() => setQueryParams());

// ----- Form validation ----- //
const validState = ref(false)

const validationStates = ref(new Map<string, boolean>())
validationStates.value.set('resourceName', false)
validationStates.value.set('resourceDescription', true)
validationStates.value.set('resourceParentId', true)
validationStates.value.set('dataUpload', true)

function validate() {
  validState.value = checkInputValidationStates()
}

function checkInputValidationStates(): boolean {
  let states = validationStates.value.values()
  while (true) {
    let result = states.next();
    if (result.done) break;
    if (!result.value) {
      return false
    }
  }
  return true
}

// ----- Input bindings ----- //
/* Resource name */
const resourceName = ref('')
const resourceNameError: Ref<string | undefined> = ref('Please enter a resource name')

watch(resourceName, () => validateResourceName())

function validateResourceName() {
  if (resourceName.value.length > 0) {
    switch (resourceType.value) {
      case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
        const valid = PROJECT_REGEX.test(resourceName.value)
        validationStates.value.set('resourceName', valid)
        resourceNameError.value = valid ? undefined : "Project names can only contain lowercase alphanumeric characters and hyphens."
        break
      }
      case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION:
      case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
        const valid = S3_KEY_REGEX.test(resourceName.value)
        validationStates.value.set('resourceName', valid)
        resourceNameError.value = valid ? undefined : 'Collection/Dataset names can only contain the following characters [a-zA-z0-9!-_.*\'()]'
        break
      }
      case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
        const valid = OBJECT_REGEX.test(resourceName.value)
        validationStates.value.set('resourceName', valid)
        resourceNameError.value = valid ? undefined : 'Object names can only contain the following characters [a-zA-z0-9!-_.*\'()/]'
        break
      }
    }
  } else {
    validationStates.value.set('resourceName', false)
    resourceNameError.value = "Please enter a resource name."
  }
  validate()
}

/* Resource title */
const resourceTitle = ref('')

/* Resource description */
const textAreaElement = ref(null)
const resourceDescription = ref('')
const charsLeft = ref(1024)
watch(resourceDescription, () => {
  charsLeft.value = 1024 - resourceDescription.value.length
  validationStates.value.set("resourceDescription", charsLeft.value >= 0)
  validate()
})

/* ----- Resource type ----- */
const resourceType = ref(v2ResourceVariant.RESOURCE_VARIANT_PROJECT)

watch(resourceType, () => {
  switch (resourceType.value) {
    case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
      validationStates.value.set('resourceParentId', true) // No parent id needed
      validationStates.value.set('dataUpload', true)  // No data upload
      dataUpload.value = null
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION:
    case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
      validationStates.value.set('dataUpload', true) // No data upload
      dataUpload.value = null
      validateParentId()
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
      if (dataUpload.value === null) {
        validationStates.value.set('dataUpload', false) // Upload needed for Object creation
      }
      validateParentId()
    }
  }
  validateResourceName()
  validate()
})

/* Resource parent ID */
const resourceParentId = ref('')
const resourceParent: Ref<ObjectInfo | undefined> = ref(undefined)
const resourceParentIdError: Ref<string | undefined> = ref('Please enter a valid parent id')

watch(resourceParentId, async () => await validateParentId())

async function validateParentId() {
  // Check if input field is empty
  if (resourceParentId.value.length > 0) {
    // Check if input is a valid ULID
    const valid = ULID_REGEX.test(resourceParentId.value)
    validationStates.value.set('resourceParentId', valid)
    resourceParentIdError.value = valid ? undefined : 'Parent id is not a valid ULID'

    if (valid) {
      // Check if resource exists
      await fetchResource(resourceParentId.value)
          .then(response => {
            if (response?.resource && response?.permission) {
              resourceParent.value = toObjectInfo(response.resource, response.permission)
            } else {
              resourceParent.value = undefined
              validationStates.value.set('resourceParentId', false)
              resourceParentIdError.value = 'Resource with this id does not exist'
            }
          })
          .catch(() => {
            resourceParent.value = undefined
            validationStates.value.set('resourceParentId', false)
            resourceParentIdError.value = 'Parent fetch failed with error'
          })
    }
  } else {
    validationStates.value.set('resourceParentId', false)
    resourceParentIdError.value = 'Please enter a valid parent id'
  }
  validate()
}

/* Resource data class */
const resourceDataclass = ref(v2DataClass.DATA_CLASS_PUBLIC)

/* Resource licenses */
const metaLicense = ref('AllRightsReserved')
const dataLicense = ref('AllRightsReserved')

/* Upload */
const dataUpload: Ref<File | null> = ref(null)
const metaUpload: Ref<File | null> = ref(null)

const uploadProgress = ref(0)

function updateProgress(current: number, total: number | undefined) {
  if (!total) return 0

  const floatProgress = current / total * 100
  uploadProgress.value = +floatProgress.toFixed(2)
}

watch(dataUpload, (value) => {
  validationStates.value.set('dataUpload', dataUpload.value !== null)
  resourceName.value = value?.name ? value.name : resourceName.value
  validate()
})

function dataFileChange(e) {
  let files: FileList = (e.target as HTMLInputElement).files || (e.dataTransfer as DataTransfer).files;
  if (files.length > 0) {
    dataUpload.value = files.item(0)
    uploadProgress.value = 0
  } else {
    dataUpload.value = null
  }
}

/* ----- Resource Authors ----- */
const authors: Ref<Map<string, v2Author>> = ref(new Map())

function addAuthor(author: v2Author) {
  authors.value.set(getUniqueId(), author)
}

function removeAuthor(key: string) {
  authors.value.delete(key)
}

/* ----- End Resource Authors ----- */
/* ----- Resource key-values ----- */
const keyValues = ref(new Map())

function addKeyValue(key: string, val: string, type: v2KeyValueVariant) {
  keyValues.value.set(key, {key: key, value: val, variant: type} as v2KeyValue)
}

function removeKeyValue(key: string) {
  keyValues.value.delete(key)
}

/* ----- End Resource key-values ----- */
/* ----- Resource relations ----- */
const relations: Ref<Map<string, v2Relation>> = ref(new Map())

function addRelation(relation: v2Relation) {
  relations.value.set(getUniqueId(), relation)
}

function removeRelation(key: string) {
  relations.value.delete(key)
}

/* ----- End Resource relations ----- */

// ----- Helper functions -----
let id = 0

function getUniqueId(): string {
  return id++ + '';
}

function textAreaAutoHeight(domElement: HTMLTextAreaElement | null, offset = 0) {
  if (domElement) {
    domElement.style.height = 'auto'
    domElement.style.height = `${domElement.scrollHeight + offset}px`
  }
}

function openModal(modalId: string) {
  let element = document.querySelector(`#${modalId}`) as HTMLElement
  import('preline').then(({HSOverlay}) => {
    HSOverlay.open(element)
  })
}

async function submit() {
  // Better safe than sorry.
  createdResource.value = undefined
  creationError.value = undefined

  // Create resource in server
  switch (resourceType.value) {
    case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
      await createProject({
        name: resourceName.value,
        title: resourceTitle.value,
        description: resourceDescription.value,
        keyValues: Array.from(keyValues.value.values()),
        relations: Array.from(relations.value.values()),
        dataClass: resourceDataclass.value,
        preferredEndpoint: '', //TODO
        metadataLicenseTag: metaLicense.value,
        defaultDataLicenseTag: dataLicense.value,
        authors: Array.from(authors.value.values())
      }).then(project => {
        console.log(project)
        createdResource.value = project
        creationError.value = undefined
      }).catch(error => {
        console.error(error)
        creationError.value = error.toString()
        createdResource.value = undefined
      })
      // Display created resource or error
      openModal('object-display')
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {
      await createCollection({
        name: resourceName.value,
        title: resourceTitle.value,
        description: resourceDescription.value,
        keyValues: Array.from(keyValues.value.values()),
        relations: Array.from(relations.value.values()),
        dataClass: resourceDataclass.value,
        projectId: resourceParentId.value,
        metadataLicenseTag: metaLicense.value,
        defaultDataLicenseTag: dataLicense.value,
        authors: Array.from(authors.value.values())
      }).then(collection => {
        console.log(collection)
        createdResource.value = collection
        creationError.value = undefined
      }).catch(error => {
        console.log(error)
        creationError.value = error.toString()
        createdResource.value = undefined
      })
      // Display created resource or error
      openModal('object-display')
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
      await createDataset({
        name: resourceName.value,
        title: resourceTitle.value,
        description: resourceDescription.value,
        keyValues: Array.from(keyValues.value.values()),
        relations: Array.from(relations.value.values()),
        dataClass: resourceDataclass.value,
        projectId: resourceParent.value?.variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT ? resourceParentId.value : undefined,
        collectionId: resourceParent.value?.variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION ? resourceParentId.value : undefined,
        metadataLicenseTag: metaLicense.value,
        defaultDataLicenseTag: dataLicense.value,
        authors: Array.from(authors.value.values())
      }).then(dataset => {
        console.log(dataset)
        createdResource.value = dataset
        creationError.value = undefined
      }).catch(error => {
        console.log(error)
        creationError.value = error.toString()
        createdResource.value = undefined
      })
      // Display created resource or error
      openModal('object-display')
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
      if (dataUpload.value !== null) {
        // Display created resource or error
        openModal('object-display')

        // Promise chain time
        await createObject({
          name: resourceName.value,
          title: resourceTitle.value,
          description: resourceDescription.value,
          keyValues: Array.from(keyValues.value.values()),
          relations: Array.from(relations.value.values()),
          dataClass: resourceDataclass.value,
          projectId: resourceParent.value?.variant === v2ResourceVariant.RESOURCE_VARIANT_PROJECT ? resourceParentId.value : undefined,
          collectionId: resourceParent.value?.variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION ? resourceParentId.value : undefined,
          datasetId: resourceParent.value?.variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET ? resourceParentId.value : undefined,
          metadataLicenseTag: metaLicense.value,
          dataLicenseTag: dataLicense.value,
          authors: Array.from(authors.value.values())
        }).then(async stagingObject => {
          // Set created resource and reset error
          createdResource.value = stagingObject
          creationError.value = undefined

          // Take any full sync dataproxy of the object and fetch credentials
          const endpoint: v2DataEndpoint | undefined = createdResource.value.endpoints?.find(ep => !ep.partialSync)
          return [stagingObject, await getUserS3Credentials(endpoint?.id)]
        }).then(async ([stagingObject, response]) => {
          // Fetch any fullsync bucket and key for upload
          let [bucket, key] = await getObjectBucketAndKey((stagingObject as v2Object).id)

          // Create S3 client for staging object
          const s3client = new S3Client({
            endpoint: (response as v2GetS3CredentialsUserTokenResponse).s3EndpointUrl,
            region: 'region-one',
            credentials: {
              accessKeyId: (response as v2GetS3CredentialsUserTokenResponse).s3AccessKey,
              secretAccessKey: (response as v2GetS3CredentialsUserTokenResponse).s3SecretKey
            }
          } as S3ClientConfig)
          /*
          // Add CORS header to client requests [broken]
          s3client.middlewareStack.add(
              (next, context) => (args) => {
                args.request.headers["access-control-request-headers"] = "access-control-allow-origin"
                return next(args)
              },
              {
                step: "build",
              },
          );
          */

          return [s3client, bucket, key]
        }).then(async ([s3client, bucket, key]) => {
          return [s3client, bucket, key, await waitForSync((s3client as S3Client), (bucket as string), (key as string))]
        }).then(async ([s3client, bucket, key, synced]) => {
          // Check if sync was successful
          if (!synced)
            throw Error('Object sync to DataProxy timed out')

          const upload = new Upload({
            client: s3client as S3Client,
            queueSize: 4, // 4 uploads concurrently
            partSize: dataUpload.value.size > 5 * 1024 * 1024 * 1024 ? 50 * 1024 * 1024 : 5 * 1024 * 1024, // 5MiB parts up to 5GiB; then 50MiB parts
            leavePartsOnError: false, // Remove uploaded parts on error
            params: {
              Bucket: bucket as string,
              Key: key as string,
              Body: dataUpload.value
            },
          })

          // Update progress bar value
          upload.on("httpUploadProgress", progress =>
              updateProgress(progress.loaded ? progress.loaded : 0, progress.total))

          // Do something after upload succeeded
          return await upload.done() //.then(() => console.log('Upload succeeded'))
        }).then(response => {
          console.log(`Upload completed with status code: ${response.$metadata.httpStatusCode}`)
        }).catch(error => {
          // Delete Object if already created
          if (createdResource.value?.id)
            deleteObject(createdResource.value.id, false).catch(error => console.log(error))

          // Set error; unset created resource
          console.log(error)
          creationError.value = error.toString()
          createdResource.value = undefined
        })
      } else {
        // Display error toast that no file was selected for upload.
      }
    }

      // Emit user update event
      EventBus.emit('updateUser')
  }
}

async function waitForSync(s3client: S3Client, bucket: string, key: string): Promise<boolean> {
  // Define head object command
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  })

  // Wait until object is synced
  let synced = false
  let tryCounter = 0
  while (!synced) {
    try {
      tryCounter++
      await s3client.send(command)
          .then(response => {
            console.log(response.$metadata.httpStatusCode)
            synced = response.$metadata.httpStatusCode === 200
          })
    } catch (error: any) {
      //console.error(error)
      if (error.message.includes('NetworkError')) {
        throw Error('CORS Error.<br/>Please check the CORS rules of your projects.')

      } else if (tryCounter > 10) {
        console.error('Wait for sync retries exhausted')
        throw Error('Wait for sync retries exhausted')
      }

      await sleep(Math.pow(2, tryCounter))
    }
  }

  return synced // Still false if try counter was exhausted
}

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))
</script>

<template>
  <NavigationTop/>

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Resource creation
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-md border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div
      class="flex flex-col space-x-2 space-y-2 md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-md">
    <div class="flex flex-col md:flex-row">
      <div class="flex flex-row md:flex-col px-4 grow border-e-gray-300">
        <!-- Resource Name Input -->
        <label for="hs-validation-name-error"
               class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Name</label>
        <div class="relative">
          <input type="text" v-model="resourceName" id="hs-validation-name-error" name="hs-validation-name-error"
                 :class="[{ 'border-red-500': !validationStates.get('resourceName') }, { 'focus:border-red-500': !validationStates.get('resourceName') }, { 'focus:ring-red-500': !validationStates.get('resourceName') },]"
                 class="py-3 px-4 block w-full rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 disabled:text-gray-500 disabled:bg-gray-200 disabled:dark:bg-gray-700"
                 :disabled="dataUpload !== null"
                 aria-describedby="hs-validation-name-error-helper"
                 placeholder="Name of the resource" required>
          <div :class="{ 'hidden': validationStates.get('resourceName') }"
               class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
            <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
          </div>
        </div>
        <p :class="{ 'hidden': validationStates.get('resourceName') }" class="text-sm text-red-600 mt-2"
           id="hs-validation-name-error-helper">{{ resourceNameError }}
        </p>
        <!-- End Resource Name Input -->
        <!-- Resource Title Input -->
        <label for="name-input-label"
               class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Title</label>
        <input type="text" v-model="resourceTitle" id="name-input-label"
               class="py-3 px-4 block w-full border-gray-400 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
               placeholder="Display name for the resource">
        <!-- End Resource Title Input -->
        <!-- Resource Description Input -->
        <div class="relative">
          <label for="hs-textarea-ex-1"
                 class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Description</label>
          <textarea id="hs-textarea-ex-1" v-model="resourceDescription" ref="textAreaElement"
                    @input="textAreaAutoHeight(textAreaElement, 3)"
                    :class="[{ 'border-red-500': !validationStates.get('resourceDescription') }, { 'focus:border-red-500': !validationStates.get('resourceDescription') }, { 'focus:ring-red-500': !validationStates.get('resourceDescription') }]"
                    class="p-4 pb-12 block w-full border-gray-400 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
                    placeholder="A concise description of the resource"></textarea>
          <!-- Toolbar -->
          <div class="absolute bottom-px inset-x-px p-2 rounded-b-md bg-white dark:bg-slate-900">
            <hr class="my-2 border-gray-200"/>
            <div class="flex justify-end items-center">
              <!-- Button Group -->
              <div class="flex items-center">
                <span :key="charsLeft"
                      :class="[{ 'text-red-500': !validationStates.get('resourceDescription') }]"
                      class="block text-sm text-gray-400">{{ charsLeft }} characters
                  left.</span>
              </div>
            </div>
          </div>
        </div>
        <!-- End Description Input -->

        <label for="resource-type-radio-label"
               class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Resource
          Type</label>
        <ul class="flex flex-col sm:flex-row">
          <li
              v-for="(value, idx) in [v2ResourceVariant.RESOURCE_VARIANT_PROJECT, v2ResourceVariant.RESOURCE_VARIANT_COLLECTION, v2ResourceVariant.RESOURCE_VARIANT_DATASET, v2ResourceVariant.RESOURCE_VARIANT_OBJECT]"
              class="inline-flex items-center gap-x-2.5 py-3 px-4 text-sm font-medium bg-white border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white">
            <div class="relative flex items-start w-full">
              <div class="flex items-center h-5">
                <input type="radio" :id="`resource-type-radio-${idx}`" name="resource-type-radio" v-model="resourceType"
                       :value="value"
                       class="border-gray-200 rounded-full disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 focus:bg-aruna-800 checked:bg-aruna-800 dark:checked:bg-aruna-600 dark:checked:border-aruna-600 dark:focus:ring-offset-gray-800">
              </div>
              <label :for="`resource-type-radio-${idx}`"
                     class="ms-3 block w-full text-sm font-bold text-gray-600 dark:text-gray-500">
                {{ toResourceTypeStr(value) }}
              </label>
            </div>
          </li>
        </ul>

        <!-- Resource Parent -->
        <div v-if="resourceType !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT">
          <label for="parent-id-input"
                 class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Parent ID</label>
          <div class="flex rounded-md">
            <span
                class="px-4 inline-flex items-center min-w-fit rounded-s-md border border-e-0 border-gray-200 bg-gray-50 text-sm text-gray-500 dark:bg-neutral-700 dark:border-neutral-700 dark:text-neutral-400">
              {{ resourceParent ? toResourceTypeStr(resourceParent.variant) : 'Unspecified' }}
            </span>
            <div class="flex grow relative">
              <input type="text"
                     v-model="resourceParentId"
                     id="parent-id-input"
                     name="parent-id-input"
                     :class="[{ 'border-red-500': !validationStates.get('resourceParentId') }, { 'focus:border-red-500': !validationStates.get('resourceParentId') }, { 'focus:ring-red-500': !validationStates.get('resourceParentId') },]"
                     class="py-3 px-4 pe-11 block w-full border-gray-200 shadow-sm rounded-e-lg text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:placeholder-neutral-500 dark:focus:ring-neutral-600"
                     aria-describedby="hs-validation-name-error-helper">
              <div :class="{ 'hidden': validationStates.get('resourceParentId') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
              </div>
            </div>
          </div>
          <p :class="{ 'hidden': validationStates.get('resourceParentId') }" class="text-sm text-red-600 mt-2"
             id="hs-validation-name-error-helper">{{ resourceParentIdError }}</p>
        </div>
        <!-- End Resource Parent -->

        <label for="name-input-label" class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Data
          Class</label>
        <ul class="flex flex-col sm:flex-row">
          <li
              v-for="(value, idx) in [v2DataClass.DATA_CLASS_PUBLIC, v2DataClass.DATA_CLASS_PRIVATE, v2DataClass.DATA_CLASS_WORKSPACE, v2DataClass.DATA_CLASS_CONFIDENTIAL]"
              class="inline-flex items-center gap-x-2.5 py-3 px-4 text-sm font-medium bg-white border border-gray-400 text-gray-800 -mt-px first:rounded-t-lg first:mt-0 last:rounded-b-lg sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-lg sm:last:rounded-es-none sm:last:rounded-se-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white">
            <div class="relative flex items-start w-full">
              <div class="flex items-center h-5">
                <input type="radio" :id="`resource-dataclass-radio-${idx}`" name="hs-horizontal-list-group-item-radio"
                       v-model="resourceDataclass" :value="value"
                       class="border-gray-200 rounded-full disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 focus:bg-aruna-800 checked:bg-aruna-800 dark:checked:bg-aruna-600 dark:checked:border-aruna-600 dark:focus:ring-offset-gray-800"
                       v-bind:checked="value === v2DataClass.DATA_CLASS_PUBLIC">
              </div>
              <label :for="`resource-dataclass-radio-${idx}`"
                     class="ms-3 block w-full text-sm font-bold text-gray-600 dark:text-gray-500">
                {{ toDataClassStr(value) }}
              </label>
            </div>
          </li>
        </ul>

        <div class="flex flex-row space-x-4 mt-6">
          <div class="flex flex-col basis-1/2">
            <label for="meta-license-select"
                   class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Metadata
              License</label>
            <select id="meta-license-select" v-model="metaLicense"
                    class="py-3 px-4 pe-9 block w-full border-gray-400 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="license in licenses" :value="license.tag"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
          <div class="flex flex-col grow">
            <label for="data-license-select" class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Data
              License</label>
            <select id="data-license-select" v-model="dataLicense"
                    class="py-3 px-4 pe-9 block w-full border-gray-400 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="license in licenses" :value="license.tag" class="bg-aruna-500"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
        </div>

        <form class="mt-6" v-if="resourceType === v2ResourceVariant.RESOURCE_VARIANT_OBJECT">
          <h3 class="block mb-2 text-lg font-medium text-gray-700 dark:text-white">
            Upload (Choose file or Drag 'n Drop)
          </h3>
          <label for="large-file-input" class="sr-only">Choose file or Drag 'n Drop</label>
          <input type="file" v-on:change="dataFileChange" name="large-file-input" id="large-file-input" class="block w-full border border-gray-200 shadow-sm rounded-md text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400
    file:bg-gray-200 file:border-0
    file:me-4
    file:py-3 file:px-4 file:sm:py-5
    dark:file:bg-gray-700 dark:file:text-gray-400">
        </form>
      </div>

      <div class="flex px-4 grow flex-row md:flex-col">
        <div class="flex flex-row mb-2 justify-start items-center">
          <label for="key-values-input"
                 class="block text-lg font-medium text-gray-700 dark:text-white">Authors</label>
          <button type="button"
                  class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full ms-4 text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  data-hs-overlay="#author-add">
            <IconSquareRoundedPlus class="flex-shrink-0 size-6"/>
          </button>
        </div>

        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-gray-400 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Name
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Email
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Orcid
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="[key, value] in authors">
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ value.firstName }} {{ value.lastName }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ value.email }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ value.orcid }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium">
                    <button type="button" @click="removeAuthor(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                      <IconTrash class="flex-shrink-0 size-6"/>
                    </button>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="flex flex-row mb-2 mt-6 justify-start items-center">
          <label for="key-values-input"
                 class="block text-lg font-medium text-gray-700 dark:text-white">Key-Values</label>
          <button type="button"
                  class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full ms-4 text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  data-hs-overlay="#key-value-add">
            <IconSquareRoundedPlus class="flex-shrink-0 size-6"/>
          </button>
        </div>

        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-gray-400 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Key
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Value
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="[key, value] in keyValues">
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{
                      key
                    }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ value.value }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ toKeyValueVariantStr(value.variant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium">
                    <!--
                    <button type="button"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                      <IconPencil class="flex-shrink-0 size-6"/>
                    </button>
                    -->
                    <button type="button" @click="removeKeyValue(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                      <IconTrash class="flex-shrink-0 size-6"/>
                    </button>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="flex flex-row mb-2 justify-start items-center mt-6 ">
          <label for="key-values-input"
                 class="block text-lg font-medium text-gray-700 dark:text-white">Additional Relations</label>
          <button type="button"
                  class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full ms-4 text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
                  data-hs-overlay="#relation-add">
            <IconSquareRoundedPlus class="flex-shrink-0 size-6"/>
          </button>
        </div>
        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-gray-400 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Resource Id
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Resource Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Relation Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Direction
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="[key, value] in relations">
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{ value.internal?.resourceId }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ toResourceTypeStr(value.internal?.resourceVariant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ toRelationVariantStr(value.internal?.definedVariant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                    {{ toRelationDirectionStr(value.internal?.direction) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium">
                    <button type="button" @click="removeRelation(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                      <IconTrash class="flex-shrink-0 size-6"/>
                    </button>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex flex-row grow justify-end">
      <button type="button" v-bind:disabled="!validState" @click="submit"
              class="py-3 px-4 inline-flex gap-x-2 text-md font-semibold rounded-md bg-aruna-800 border border-gray-200 text-white hover:border-aruna-800 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
        Create Resource
      </button>
    </div>
  </div>

  <ModalAuthor modalId="author-add" @add-author="addAuthor"/>
  <ModalKeyValue modalId="key-value-add" @add-key-value="addKeyValue"/>
  <ModalRelation modalId="relation-add" @add-relation="addRelation"/>
  <ModalObjectDisplay modalId="object-display" :object="createdResource" :progress="uploadProgress"
                      :errorMsg="creationError"/>
  <Footer/>
</template>