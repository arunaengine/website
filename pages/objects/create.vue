<script setup lang="ts">
import {IconSquareRoundedPlus, IconExclamationCircle, IconTrash, IconArrowLeft} from '@tabler/icons-vue';
import {
  v2DataClass,
  v2KeyValueVariant,
  v2ResourceVariant,
  type v2KeyValue,
  type v2Relation,
  type v2Author,
  type v2Project
} from '~/composables/aruna_api_json';
import {toRelationDirectionStr, toRelationVariantStr} from "~/composables/enum_conversions";
import {OBJECT_REGEX, PROJECT_REGEX, S3_KEY_REGEX, ULID_REGEX} from "~/composables/constants";

// Router to navigate back
const router = useRouter()
const licenses = await fetchLicenses()

const createdResource: Ref<v2Project | undefined> = ref(undefined)
const creationError: Ref<string | undefined> = ref(undefined)

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
  let vals = validationStates.value.values()
  while (true) {
    let result = vals.next();
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
const resourceParentIdError: Ref<string | undefined> = ref('Please enter a valid parent id')

watch(resourceParentId, () => validateParentId())

function validateParentId() {
  if (resourceParentId.value.length > 0) {
    const valid = ULID_REGEX.test(resourceParentId.value)
    validationStates.value.set('resourceParentId', valid)
    resourceParentIdError.value = valid ? undefined : 'Parent id is not a valid ULID'
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

function updateProgress(current: number, total: number) {
  uploadProgress.value = Math.trunc(current / total * 100)
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
      // Fetch parent resource
      const parent = await fetchResource(resourceParentId.value)
      if (parent.resource?.dataset || parent.resource?.object) {
        //TODO: Implement error handling -> Display error message
        throw Error("Parent is not a Collection or Project")
      }

      await createDataset({
        name: resourceName.value,
        title: resourceTitle.value,
        description: resourceDescription.value,
        keyValues: Array.from(keyValues.value.values()),
        relations: Array.from(relations.value.values()),
        dataClass: resourceDataclass.value,
        projectId: parent.resource?.project ? resourceParentId.value : undefined,
        collectionId: parent.resource?.collection ? resourceParentId.value : undefined,
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
      if (dataUpload.value) {
        // Fetch parent resource
        const parent = await fetchResource(resourceParentId.value)
        if (parent.resource?.object) {
          //TODO: Implement error handling -> Display error message
          throw Error("Parent is not a Collection, Dataset or Project")
        }
        const parentInfo = toObjectInfo(parent.resource, parent.permission)

        // Create staging Object
        const stagingObject = await createObject(
            dataUpload.value.name,
            resourceTitle.value,
            Array.from(authors.value.values()),
            resourceDescription.value,
            Array.from(keyValues.value.values()),
            Array.from(relations.value.values()),
            resourceDataclass.value,
            parentInfo ? parentInfo.variant : v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED,
            resourceParentId.value,
            metaLicense.value,
            dataLicense.value
        ).catch(error => {
          console.error(error)
          //TODO: Error handling
          //TODO: Display error message
        })

        if (stagingObject?.id) {
          createdResource.value = stagingObject
          const url = await getUploadUrl(stagingObject.id)

          if (url.url) {
            const data = new Uint8Array(await dataUpload.value.arrayBuffer());

            const xhr = new XMLHttpRequest()
            xhr.open('put', url.url, true)
            xhr.upload.onprogress = function (event) {
              // Upload progress here
              updateProgress(event.loaded, event.total)
            }
            xhr.onreadystatechange = function () {
              if (xhr.readyState === 4) {
                // Upload finished successful
                console.log('Uploaded')
                creationError.value = undefined
              }
            }
            xhr.send(data)

            /*
            //TODO: Implement progress bar
            const blob = new Blob([data])
            const progressUpdateStream = new TransformStream({
              transform(chunk, controller) {
                //TODO: Implement progress bar update
              }
            })

            await $fetch(url.url, {
              method: "PUT",
              body: data
            }).then(object => {
              creationError.value = undefined
              //TODO: Display success message
            }).catch(error => {
              console.error()
              //TODO: Error progress bar
              //TODO: Delete staging object?
            })
            */
          } else {
            console.error("Response does not contain upload url")
          }
        }
        // Display created resource or error
        openModal('object-display')

        /*
        //TODO: Choose "nearest" DataProxy
        // Fetch S3 credentials and create S3 client
        const creds = await getUserS3Credentials(endpointId)
        const client = new S3Client({
          endpoint: creds.s3EndpointUrl,
          region: 'region-one',
          credentials: {
            accessKeyId: creds.s3AccessKey,
            secretAccessKey: creds.s3SecretKey
          }
        });

        // Upload file to Dataproxy
        //TODO: Fetch parent Project for bucket info
        const data = new Uint8Array(await dataUpload.value.arrayBuffer());
        const command = new PutObjectCommand({
          Bucket: "myproject",
          Key: dataUpload.value.name,
          Body: data,
          ContentLength: dataUpload.value.size
        });

        try {
          const response = await client.send(command);
          console.log(response);
        } catch (err) {
          console.error(err);
          //TODO: Delete staging object
        }
        */
      } else {
        //TODO: Display error
      }
    }
  }
}
</script>

<template>
  <NavigationTop/>

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Resource creation
    </h1>
    <button @click="router.back()"
            class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon"/>
    </button>
  </div>

  <div
      class="flex flex-col space-x-2 space-y-2 md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-lg">
    <div class="flex flex-col md:flex-row">
      <div class="flex flex-row md:flex-col px-4 grow border-e-gray-300">
        <!-- Resource Name Input -->
        <label for="hs-validation-name-error"
               class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Name</label>
        <div class="relative">
          <input type="text" v-model="resourceName" id="hs-validation-name-error" name="hs-validation-name-error"
                 :class="[{ 'border-red-500': !validationStates.get('resourceName') }, { 'focus:border-red-500': !validationStates.get('resourceName') }, { 'focus:ring-red-500': !validationStates.get('resourceName') },]"
                 class="py-3 px-4 block w-full rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 disabled:text-gray-500 disabled:bg-gray-200 disabled:dark:bg-gray-700"
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
               class="py-3 px-4 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
               placeholder="Display name for the resource">
        <!-- End Resource Title Input -->
        <!-- Resource Description Input -->
        <div class="relative">
          <label for="hs-textarea-ex-1"
                 class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Description</label>
          <textarea id="hs-textarea-ex-1" v-model="resourceDescription" ref="textAreaElement"
                    @input="textAreaAutoHeight(textAreaElement, 3)"
                    :class="[{ 'border-red-500': !validationStates.get('resourceDescription') }, { 'focus:border-red-500': !validationStates.get('resourceDescription') }, { 'focus:ring-red-500': !validationStates.get('resourceDescription') }]"
                    class="p-4 pb-12 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
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
                       class="border-gray-200 rounded-full disabled:opacity-50 dark:bg-gray-800 dark:border-gray-700 focus:bg-aruna-800 checked:bg-aruna-800 dark:checked:bg-aruna-600 dark:checked:border-aruna-600 dark:focus:ring-offset-gray-800"
                       v-bind:checked="value === v2ResourceVariant.RESOURCE_VARIANT_PROJECT">
              </div>
              <label :for="`resource-type-radio-${idx}`"
                     class="ms-3 block w-full text-sm font-bold text-gray-600 dark:text-gray-500">
                {{ toResourceTypeStr(value) }}
              </label>
            </div>
          </li>
        </ul>

        <!-- Resource parent ID input -->
        <div v-if="resourceType !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT">
          <label for="hs-validation-name-error"
                 class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Parent ID</label>
          <div class="relative">
            <input type="text" v-model="resourceParentId" id="hs-validation-name-error" name="hs-validation-name-error"
                   :class="[{ 'border-red-500': !validationStates.get('resourceParentId') }, { 'focus:border-red-500': !validationStates.get('resourceParentId') }, { 'focus:ring-red-500': !validationStates.get('resourceParentId') },]"
                   class="py-3 px-4 block w-full rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
                   required aria-describedby="hs-validation-name-error-helper">
            <div :class="{ 'hidden': validationStates.get('resourceParentId') }"
                 class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
              <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500"/>
            </div>
          </div>
          <p :class="{ 'hidden': validationStates.get('resourceParentId') }" class="text-sm text-red-600 mt-2"
             id="hs-validation-name-error-helper">{{ resourceParentIdError }}</p>
        </div>
        <!-- End Resource parent ID input -->

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
                    class="py-3 px-4 pe-9 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="license in licenses" :value="license.tag"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
          <div class="flex flex-col grow">
            <label for="data-license-select" class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Data
              License</label>
            <select id="data-license-select" v-model="dataLicense"
                    class="py-3 px-4 pe-9 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="license in licenses" :value="license.tag" class="bg-aruna-500"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
        </div>

        <form class="mt-6" v-if="resourceType === v2ResourceVariant.RESOURCE_VARIANT_OBJECT">
          <h3 class="block mb-2 text-lg font-medium text-gray-700 dark:text-white">Upload (Choose file or Drag 'n
            Drop)</h3>
          <label for="large-file-input" class="sr-only">Choose file or Drag 'n Drop</label>
          <input type="file" v-on:change="dataFileChange" name="large-file-input" id="large-file-input" class="block w-full border border-gray-200 shadow-sm rounded-lg text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400
    file:bg-gray-200 file:border-0
    file:me-4
    file:py-3 file:px-4 file:sm:py-5
    dark:file:bg-gray-700 dark:file:text-gray-400">

          <!-- Progress -->
          <div class="flex items-center gap-x-3 whitespace-nowrap">
            <div class="flex w-full h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700" role="progressbar"
                 :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100">
              <div
                  class="flex flex-col justify-center rounded-full overflow-hidden bg-blue-600 text-xs text-white text-center whitespace-nowrap transition duration-500 dark:bg-blue-500"
                  :style="`width: ${uploadProgress}%`"></div>
            </div>
            <div class="w-10 text-end">
              <span class="text-sm text-gray-800 dark:text-white">{{ uploadProgress }}%</span>
            </div>
          </div>
          <!-- End Progress -->
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
        <!-- <p class="p-4 mt-2 text-center border rounded-lg">Coming soon ...</p> -->
        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-gray-400 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Resource Id
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Resource Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Relation Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-gray-500 uppercase">Direction
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
              class="py-3 px-4 inline-flex gap-x-2 text-md font-semibold rounded-lg bg-aruna-800 border border-gray-200 text-white hover:border-aruna-800 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
        Create Resource
      </button>
    </div>
  </div>

  <ModalAuthor modalId="author-add" @add-author="addAuthor"/>
  <ModalKeyValue modalId="key-value-add" @add-key-value="addKeyValue"/>
  <ModalRelation modalId="relation-add" @add-relation="addRelation"/>
  <ModalObjectDisplay modalId="object-display" :object="createdResource" :errorMsg="creationError"/>
  <Footer/>
</template>