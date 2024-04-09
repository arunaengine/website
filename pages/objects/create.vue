<script setup lang="ts">
import { IconSquareRoundedPlus } from '@tabler/icons-vue';
import { IconPencil } from '@tabler/icons-vue';
import { IconExclamationCircle } from '@tabler/icons-vue';
import { IconTrash } from '@tabler/icons-vue';
import { IconArrowLeft } from '@tabler/icons-vue';
import { v2DataClass, v2KeyValueVariant, v2ResourceVariant, type v2KeyValue } from '~/composables/aruna_api_json';

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";


// Router to navigate back
const router = useRouter()
const licenses = await fetchLicenses()

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
const PROJECT_REGEX = '^[a-z0-9\-]+$'
const S3_KEY_REGEX = '^[a-zA-Z0-9\-\!\_\.\*\_\'\(\)]+$'
const OBJECT_REGEX = '^[a-zA-Z0-9\-\!\_\.\*\_\'\(\)\/]+$'
const ULID_REGEX = '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'

/* Resource name */
const resourceName = ref('')
const resourceNameError= ref('Please enter a resource name')

watch(resourceName, () => {
  //ToDo: Fix check against regex depending on resource type
  if (resourceName.value.length > 0) {
    switch (resourceType.value) {
      case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
        validationStates.value.set('resourceName', resourceName.value.match(PROJECT_REGEX) !== null)
        resourceNameError.value = "Project names can only contain lowercase alphanumeric characters and hyphens."
        break
      }
      case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION:
      case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
        validationStates.value.set('resourceName', resourceName.value.match(S3_KEY_REGEX) !== null)
        break
      }
      case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
        validationStates.value.set('resourceName', resourceName.value.match(OBJECT_REGEX) !== null)
        break
      }
    }
  } else {
    validationStates.value.set('resourceName', false)
    resourceNameError.value = "Please enter a resource name."
  }
  validate()
})

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

/* Resource key-values */
const keyValues = ref(new Map()) //ToDo: Modal to add/edit key-values

function addKeyValue(key: string, val: string, type: v2KeyValueVariant) {
  keyValues.value.set(key, { key: key, value: val, variant: type } as v2KeyValue)
}
//ToDo: Remove dummy values
/* 
keyValues.value.set('geoengine.app', { key: 'geoengine.app', value: '', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL } as v2KeyValue)
keyValues.value.set('geoengine.app/nv_50', { key: 'geoengine.app/nv_50', value: '123895', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL } as v2KeyValue)
keyValues.value.set('geoengine.hook/process', { key: 'geoengine.hook/process', value: '', variant: v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK } as v2KeyValue)
*/

/* Resource relations */
const relations = ref(new Map()) //ToDo: Modal to add/edit relations

/* Resource type */
const resourceType = ref(v2ResourceVariant.RESOURCE_VARIANT_PROJECT)
watch(resourceType, () => {
  switch (resourceType.value) {
    case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
      validationStates.value.set('resourceParentId', true)
      validationStates.value.set('dataUpload', true)
      break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: { }
    case v2ResourceVariant.RESOURCE_VARIANT_DATASET: { }
    case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
      if (dataUpload.value === null) {
        validationStates.value.set('dataUpload', false) // Upload needed for Object creation
      }
      if (resourceParentId.value.length <= 0) {
        validationStates.value.set('resourceParentId', false)
      }
    }
  }
  validate()
})

/* Resource parent ID */
const resourceParentId = ref('')
const resourceParentIdError = ref('Please enter a valid parent id')

watch(resourceParentId, () => validateParentId())
function validateParentId() {
  if (resourceParentId.value.length > 0) {
    validationStates.value.set('resourceParentId', resourceParentId.value.match(ULID_REGEX) !== null)
    resourceParentIdError.value = 'Parent id is not a valid ULID'

  } else {
    validationStates.value.set('resourceParentId', false)
    resourceParentIdError.value ='Please enter a valid parent id'
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

watch(dataUpload, () => {
  validationStates.value.set('dataUpload', dataUpload.value !== null)
  validate()
})

function dataFileChange(e) {
  var files: FileList = (e.target as HTMLInputElement).files || (e.dataTransfer as DataTransfer).files;
  if (files.length > 0) {
    dataUpload.value = files.item(0)
  } else {
    dataUpload.value = null
  }
}

// ----- Helper functions -----
function textAreaAutoHeight(domElement: HTMLTextAreaElement | null, offset = 0) {
  if (domElement) {
    domElement.style.height = 'auto'
    domElement.style.height = `${domElement.scrollHeight + offset}px`
  }
}

function removeKeyValue(key: string) {
  keyValues.value.delete(key)
}

async function submit() {
  //TODO: Transform key-value map to v2KeyValue[]
  const protoKeyValues: v2KeyValue[] = []
  //TODO: Transform relations map to v2Relation[]
  const relations = []

  // Create resource in server
  switch (resourceType.value) {
    case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
      await createProject(resourceName.value, resourceDescription.value, protoKeyValues, resourceDataclass.value, metaLicense.value, dataLicense.value)
        .then(response => console.log(response))
        .catch(error => console.log(error))
        break
    }
    case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {

    }
    case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {

    }
    case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
      if (dataUpload.value) {
        //TODO: Create Object
        await createObject(
          dataUpload.value.name,
          resourceTitle.value,
          [], //TODO
          resourceDescription.value,
          [], // TODO
          resourceDataclass.value,
          v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
          resourceParentId.value,
          metaLicense.value,
          dataLicense.value
        )

        //TODO: Fetch S3 credentials and create S3 client
        const client = new S3Client({
          endpoint: '<Endpoint-Url>',
          region: '<Some-Region>',
          credentials: {
            accessKeyId: '<AccessKeyId>',
            secretAccessKey: '<AccessSecret>'
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
      }
    }
  }
}
</script>

<template>
  <NavbarTop />

  <div class="flex flex-wrap justify-between container mx-auto my-10">
    <h1 class="text-3xl font-bold text-gray-700 dark:text-white">
      Resource creation
    </h1>
    <button @click="router.back()"
      class="cursor-pointer px-4 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent text-gray-700 hover:bg-gray-300 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/30 dark:hover:text-gray-400 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
      <IconArrowLeft class="icon" />
    </button>
  </div>

  <div
    class="flex flex-col space-x-2 space-y-2 md:container sm:mx-1 md:mx-auto mt-4 p-4 border border-gray-500 rounded-lg">
    <div class="flex flex-row">
      <div class="flex flex-row md:flex-col px-4 grow border-e-gray-300">

        <!-- Resource Name Input -->
        <div>
          <label for="hs-validation-name-error"
            class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Name</label>
          <div class="relative">
            <input type="text" v-model="resourceName" id="hs-validation-name-error" name="hs-validation-name-error"
              :class="[{ 'border-red-500': !validationStates.get('resourceName') }, { 'focus:border-red-500': !validationStates.get('resourceName') }, { 'focus:ring-red-500': !validationStates.get('resourceName') },]"
              class="py-3 px-4 block w-full rounded-lg text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
              required aria-describedby="hs-validation-name-error-helper">
            <div :class="{ 'hidden': validationStates.get('resourceName') }"
              class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
              <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500" />
            </div>
          </div>
          <p :class="{ 'hidden': validationStates.get('resourceName') }" class="text-sm text-red-600 mt-2"
            id="hs-validation-name-error-helper">{{ resourceNameError }}</p>
        </div>
        <!-- End Resource Name Input -->

        <div class="flex flex-row space-x-4">
          <div class="flex flex-col grow">
            <label for="name-input-label"
              class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Title</label>
            <input type="text" v-model="resourceTitle" id="name-input-label"
              class="py-3 px-4 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
              placeholder="Display name for the resource" required>
          </div>
          <div class="flex flex-col grow">
            <label for="name-input-label"
              class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Author</label>
            <input type="text" id="name-input-label"
              class="py-3 px-4 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
              placeholder="Owner of the resource" required>
          </div>
        </div>

        <!-- Textarea -->
        <div class="relative">
          <label for="hs-textarea-ex-1"
            class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Description</label>
          <textarea id="hs-textarea-ex-1" v-model="resourceDescription" ref="textAreaElement"
            @input="textAreaAutoHeight(textAreaElement, 3)"
            :class="[{ 'border-red-500': !validationStates.get('resourceDescription') }, { 'focus:border-red-500': !validationStates.get('resourceDescription') }, { 'focus:ring-red-500': !validationStates.get('resourceDescription') }]" 
            class="p-4 pb-12 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
            placeholder="Enter a description of the resource"></textarea>
          <!-- Toolbar -->
          <div class="absolute bottom-px inset-x-px p-2 rounded-b-md bg-white dark:bg-slate-900">
            <hr class="my-2 border-gray-200" />
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
        <!-- End Textarea -->

        <label for="name-input-label" class="block mt-6 text-lg font-medium mb-2 text-gray-700 dark:text-white">Resource
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
              <IconExclamationCircle class="flex-shrink-0 size-4 text-red-500" />
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
                v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}</option>
            </select>
          </div>
          <div class="flex flex-col grow">
            <label for="data-license-select" class="block text-lg font-medium mb-2 text-gray-700 dark:text-white">Data
              License</label>
            <select id="data-license-select" v-model="dataLicense"
              class="py-3 px-4 pe-9 block w-full border-gray-400 rounded-lg text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600">
              <option v-for="license in licenses" :value="license.tag" class="bg-aruna-500"
                v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}</option>
            </select>
          </div>
        </div>

        <form class="mt-6" v-if="resourceType === v2ResourceVariant.RESOURCE_VARIANT_OBJECT">
          <h3 for="-input" class="block mb-2 text-lg font-medium text-gray-700 dark:text-white">Upload (Drag'n'Drop
            possible ...)</h3>
          <label for="large-file-input" class="sr-only">Choose file or Drag 'n Drop'</label>
          <input type="file" v-on:change="dataFileChange" name="large-file-input" id="large-file-input" class="block w-full border border-gray-200 shadow-sm rounded-lg text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400
    file:bg-gray-200 file:border-0
    file:me-4
    file:py-3 file:px-4 file:sm:py-5
    dark:file:bg-gray-700 dark:file:text-gray-400">
        </form>
      </div>

      <div class="flex px-4 grow flex-row md:flex-col">
        <div class="flex flex-row mb-2 justify-start items-center">
          <label for="key-values-input"
            class="block text-lg font-medium text-gray-700 dark:text-white">Key-Values</label>
          <button type="button" 
            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full ms-4 text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            :data-hs-overlay="`#key-value-add`">
            <IconSquareRoundedPlus class="flex-shrink-0 size-6" />
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
                      {{ key
                      }}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                      {{ value.value }}
                    </td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                      {{ toKeyValueVariantStr(value.variant) }}</td>
                    <td class="px-6 py-2 whitespace-nowrap text-sm font-medium">
                      <button type="button"
                        class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                        <IconPencil class="flex-shrink-0 size-6" />
                      </button>
                      <button type="button" @click="removeKeyValue(key)"
                        class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
                        <IconTrash class="flex-shrink-0 size-6" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <hr class="my-8 border-gray-300 dark:border-white">

        <div class="flex flex-row mb-2 justify-start items-center mt-6 ">
          <label for="key-values-input"
            class="block text-lg font-medium text-gray-700 dark:text-white">Relations</label>
          <button disabled type="button"
            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full ms-4 text-gray-500 hover:bg-blue-100 hover:text-blue-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
            <IconSquareRoundedPlus class="flex-shrink-0 size-6" />
          </button>
        </div>
        <p class="p-4 mt-2 text-center border rounded-lg">Coming soon ...</p>
      </div>
    </div>

    <div class="flex flex-row grow justify-end">
      <button type="button" v-bind:disabled="!validState" @click="submit"
        class="py-3 px-4 inline-flex gap-x-2 text-md font-semibold rounded-lg bg-aruna-800 border border-gray-200 text-white hover:border-aruna-800 hover:text-aruna-800 disabled:opacity-50 disabled:pointer-events-none dark:border-gray-700 dark:text-gray-400 dark:hover:text-blue-500 dark:hover:border-blue-600 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600">
        Create Resource
      </button>
    </div>
  </div>

  <ModalKeyValue modalId="key-value-add" @add-key-value="addKeyValue" />

  <Footer />
</template>