<script setup lang="ts">
import {IconArrowLeft, IconExclamationCircle, IconPlus, IconTrash} from '@tabler/icons-vue'
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

import {
  toRelationDirectionStr,
  toRelationVariantStr,
  toResourceTypeStr,
  fromDataClassStr,
  fromResourceTypeStr
} from "~/composables/enum_conversions"
import {OBJECT_REGEX, PROJECT_REGEX, S3_KEY_REGEX, ULID_REGEX} from "~/composables/constants"
import type {ObjectInfo} from "~/composables/proto_conversions"
import {deleteObject, getObjectBucketAndKey} from "~/composables/api_wrapper"
import EventBus from "~/composables/EventBus";
import AuthorDialog from "~/components/custom-ui/dialog/AuthorDialog.vue";
import KeyValueDialog from "~/components/custom-ui/dialog/KeyValueDialog.vue";

import {HeadObjectCommand, S3Client, type S3ClientConfig} from "@aws-sdk/client-s3";
import {Upload} from "@aws-sdk/lib-storage";
import {prettyDisplayJson} from "~/composables/utils";
import { ValueIcon } from '@radix-icons/vue'
import OntologyDialog from "~/components/custom-ui/dialog/OntologyDialog.vue";

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
    const resourceTypeParam = getParamSingle("type");
    if (resourceTypeParam) {
      resourceType.value = fromResourceTypeStr(resourceTypeParam, v2ResourceVariant.RESOURCE_VARIANT_PROJECT);
    }
    const dataClassParam = getParamSingle("class");
    if (dataClassParam) {
      resourceDataclass.value = fromDataClassStr(dataClassParam);
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
const authorDialogOpen = ref(false);

function addAuthor(author: v2Author) {
  authors.value.set(getUniqueId(), author)
}

function removeAuthor(key: string) {
  authors.value.delete(key)
}

/* ----- End Resource Authors ----- */

/* ----- Resource key-values ----- */
const keyValues = ref(new Map())
const keyValueDialogOpen = ref(false);
const ontologyDialogOpen = ref(false);

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


  <div class="min-h-[calc(100vh-110px)]">
  <div
      class="flex flex-col space-x-2 space-y-2 md:max-w-screen-2xl sm:mx-1 md:mx-auto my-10 p-4 border border-aruna-text/50 rounded-md bg-aruna-bg/90">
    <h1 class="text-3xl font-bold text-aruna-text-accent">
      Resource creation
    </h1>

    <Separator class="my-10 bg-aruna-text"/>

    <div class="flex flex-col md:flex-row">
      <div class="flex flex-row md:flex-col px-4 grow">
        <!-- Resource Name Input -->
        <label for="hs-validation-name-error"
               class="block text-lg font-medium mb-2 text-aruna-text-accent">Name</label>
        <div class="relative">
          <input type="text"
                 v-model="resourceName"
                 id="hs-validation-name-error"
                 name="hs-validation-name-error"
                 :class="[{'border-destructive focus:border-destructive': !validationStates.get('resourceName')}]"
                 class="py-3 px-4 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-highlight focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none"
                 :disabled="dataUpload !== null"
                 aria-describedby="hs-validation-name-error-helper"
                 placeholder="Name of the resource" required>
          <div :class="{ 'hidden': validationStates.get('resourceName') }"
               class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
            <IconExclamationCircle class="flex-shrink-0 size-4 text-destructive"/>
          </div>
        </div>
        <p :class="{ 'hidden': validationStates.get('resourceName') }" class="text-sm text-destructive mt-2"
           id="hs-validation-name-error-helper">{{ resourceNameError }}
        </p>
        <!-- End Resource Name Input -->
        <!-- Resource Title Input -->
        <label for="display-name-input"
               class="block mt-6 text-lg font-medium mb-2 text-aruna-text-accent">Title</label>
        <input type="text"
               v-model="resourceTitle"
               id="display-name-input"
               class="py-3 px-4 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-highlight focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none"
               placeholder="Display name for the resource">
        <!-- End Resource Title Input -->
        <!-- Resource Description Input -->
        <div class="relative">
          <label for="hs-textarea-ex-1"
                 class="block mt-6 text-lg font-medium mb-2 text-aruna-text-accent">Description</label>
          <textarea id="hs-textarea-ex-1"
                    v-model="resourceDescription"
                    ref="textAreaElement"
                    @input="textAreaAutoHeight(textAreaElement, 3)"
                    :class="[{'border-destructive focus:border-destructive focus:ring-destructive': !validationStates.get('resourceDescription')}]"
                    class="p-4 pb-12 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-highlight focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none"
                    placeholder="A concise description of the resource"></textarea>
          <!-- Toolbar -->
          <div class="absolute bottom-px inset-x-px p-2 rounded-b-md bg-aruna-muted">
            <hr class="my-2 border-aruna-text"/>
            <div class="flex justify-end items-center">
              <!-- Button Group -->
              <div class="flex items-center">
                <span :key="charsLeft"
                      :class="[{ 'text-destructive': !validationStates.get('resourceDescription') }]"
                      class="block text-sm text-aruna-text">{{ charsLeft }} characters left.</span>
              </div>
            </div>
          </div>
        </div>
        <!-- End Description Input -->

        <label for="resource-type-radio-label"
               class="block mt-6 text-lg font-medium mb-2 text-aruna-text-accent">Resource Type</label>
        <ul class="flex flex-col sm:flex-row">
          <li v-for="(value, idx) in [v2ResourceVariant.RESOURCE_VARIANT_PROJECT, v2ResourceVariant.RESOURCE_VARIANT_COLLECTION, v2ResourceVariant.RESOURCE_VARIANT_DATASET, v2ResourceVariant.RESOURCE_VARIANT_OBJECT]"
              class="inline-flex items-center gap-x-2.5 py-3 px-4 text-aruna-text-accent text-sm font-medium bg-aruna-muted border border-aruna-text/50 -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-md sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-md sm:last:rounded-es-none sm:last:rounded-se-md">
            <div class="relative flex items-start w-full">
              <div class="flex items-center h-5">
                <input type="radio"
                       :id="`resource-type-radio-${idx}`"
                       name="resource-type-radio"
                       v-model="resourceType"
                       :value="value"
                       class="shrink-0 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"/>
              </div>
              <label :for="`resource-type-radio-${idx}`"
                     class="ms-3 block w-full text-sm font-bold text-aruna-text-accent">
                {{ toResourceTypeStr(value) }}
              </label>
            </div>
          </li>
        </ul>

        <!-- Resource Parent -->
        <div v-if="resourceType !== v2ResourceVariant.RESOURCE_VARIANT_PROJECT">
          <label for="parent-id-input"
                 class="block mt-6 text-lg font-medium mb-2 text-aruna-text-accent">
            Parent ID
          </label>
          <div class="flex rounded-md">
            <span
                class="px-4 inline-flex items-center min-w-fit rounded-s-md border border-e-0 border-aruna-text/50 bg-aruna-fg text-sm text-aruna-text-accent">
              {{ resourceParent ? toResourceTypeStr(resourceParent.variant) : 'Unspecified' }}
            </span>
            <div class="flex grow relative">
              <input type="text"
                     v-model="resourceParentId"
                     id="parent-id-input"
                     name="parent-id-input"
                     :class="[{'border-destructive ': !validationStates.get('resourceParentId') }]"
                     class="py-3 px-4 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-highlight focus:ring-1 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none rounded-s-none"
                     aria-describedby="hs-validation-name-error-helper">
              <div :class="{ 'hidden': validationStates.get('resourceParentId') }"
                   class="absolute inset-y-0 end-0 flex items-center pointer-events-none pe-3">
                <IconExclamationCircle class="flex-shrink-0 size-4 text-destructive"/>
              </div>
            </div>
          </div>
          <p :class="{ 'hidden': validationStates.get('resourceParentId') }" class="text-sm text-destructive mt-2"
             id="hs-validation-name-error-helper">{{ resourceParentIdError }}</p>
        </div>
        <!-- End Resource Parent -->

        <label for="name-input-label"
               class="block mt-6 text-lg font-medium mb-2 text-aruna-text-accent">
          Data Class
        </label>
        <ul class="flex flex-col sm:flex-row">
          <li v-for="(value, idx) in [v2DataClass.DATA_CLASS_PUBLIC, v2DataClass.DATA_CLASS_PRIVATE, v2DataClass.DATA_CLASS_WORKSPACE, v2DataClass.DATA_CLASS_CONFIDENTIAL]"
              class="inline-flex items-center gap-x-2.5 py-3 px-4 text-aruna-text-accent text-sm font-medium bg-aruna-muted border border-aruna-text/50 -mt-px first:rounded-t-sm first:mt-0 last:rounded-b-md sm:-ms-px sm:mt-0 sm:first:rounded-se-none sm:first:rounded-es-md sm:last:rounded-es-none sm:last:rounded-se-md">
            <div class="relative flex items-start w-full">
              <div class="flex items-center h-5">
                <input type="radio"
                       :id="`resource-dataclass-radio-${idx}`"
                       name="hs-horizontal-list-group-item-radio"
                       v-model="resourceDataclass"
                       :value="value"
                       class="shrink-0 border-aruna-text/50 rounded-full text-aruna-highlight focus:ring-0 disabled:opacity-50 disabled:pointer-events-none bg-aruna-muted checked:bg-aruna-highlight checked:border-aruna-muted focus:ring-offset-0"
                       v-bind:checked="value === v2DataClass.DATA_CLASS_PUBLIC">
              </div>
              <label :for="`resource-dataclass-radio-${idx}`"
                     class="ms-3 block w-full text-sm font-bold text-aruna-text-accent">
                {{ toDataClassStr(value) }}
              </label>
            </div>
          </li>
        </ul>

        <div class="flex flex-row space-x-4 mt-6">
          <div class="flex flex-col basis-1/2">
            <label for="meta-license-select"
                   class="block text-lg font-medium mb-2 text-aruna-text-accent">
              Metadata License
            </label>
            <select id="meta-license-select"
                    v-model="metaLicense"
                    class="py-3 px-4 pe-9 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none">
              <option v-for="license in licenses"
                      :value="license.tag"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
          <div class="flex flex-col grow">
            <label for="data-license-select"
                   class="block text-lg font-medium mb-2 text-aruna-text-accent">
              Data License
            </label>
            <select id="data-license-select"
                    v-model="dataLicense"
                    class="py-3 px-4 pe-9 block w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text text-sm focus:border-aruna-text/50 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none">
              <option v-for="license in licenses"
                      :value="license.tag"
                      v-bind:selected="license.tag === 'AllRightsReserved'">{{ license.name }}
              </option>
            </select>
          </div>
        </div>

        <form class="mt-6" v-if="resourceType === v2ResourceVariant.RESOURCE_VARIANT_OBJECT">
          <h3 class="block mb-2 text-lg font-medium text-aruna-text-accent">
            Upload (Choose file or Drag 'n Drop)
          </h3>
          <label for="large-file-input" class="sr-only">Choose file or Drag 'n Drop</label>
          <input type="file"
                 v-on:change="dataFileChange"
                 name="large-file-input"
                 id="large-file-input"
                 class="block w-full border border-aruna-text/50 shadow-sm rounded-md bg-aruna-muted text-aruna-text text-sm focus:z-10 focus:border-aruna-text/50 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none
                        file:bg-aruna-fg
                        file:text-aruna-text-accent
                        file:border-0
                        file:me-4
                        file:p-4">
        </form>
      </div>

      <div class="flex px-4 grow flex-row md:flex-col overflow-x-auto">
        <div class="flex flex-row mb-2 justify-start items-center">
          <label for="key-values-input"
                 class="block text-lg font-medium text-aruna-text-accent">Authors</label>
            <button
              type="button"
              @click="authorDialogOpen = true"
              class="ms-4 inline-flex items-center gap-x-2 m-0.5 p-0.5 border border-aruna-text-accent rounded-md text-aruna-text-accent hover:text-aruna-highlight hover:border-aruna-highlight focus:outline-none disabled:opacity-50 disabled:pointer-events-none">
              <IconPlus class="flex-shrink-0 size-4" />
            </button>
        </div>

        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-aruna-text/50">
              <table class="min-w-full divide-y divide-aruna-text">
                <thead class="bg-aruna-muted">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Name
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Email
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Orcid
                  </th>
                  <th scope="col" class="px-6 py-3 text-center text-sm font-bold text-aruna-text-accent uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-aruna-text/50">
                <tr v-for="[key, value] in authors">
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ value.firstName }} {{ value.lastName }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ value.email }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ value.orcid }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium text-center">
                    <button type="button"
                            @click="removeAuthor(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-aruna-text hover:text-destructive focus:z-10 focus:outline-none focus:ring-2 focus:text-destructive focus:ring-destructive">
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
                 class="block text-lg font-medium text-aruna-text-accent">Key-Values</label>
          <button type="button"
                  @click="keyValueDialogOpen = true"
                  class="ms-4 px-1 inline-flex items-center gap-x-2 m-0.5 p-0.5 border border-aruna-text-accent rounded-md text-aruna-text-accent text-sm hover:text-aruna-highlight hover:border-aruna-highlight focus:outline-none disabled:opacity-50 disabled:pointer-events-none">
            <IconPlus class="flex-shrink-0 size-4"/>
          </button>
          <button type="button"
                  class="ms-4 px-1 inline-flex items-center gap-x-2 m-0.5 p-0.5 border border-aruna-text-accent rounded-md text-aruna-text-accent text-sm hover:text-aruna-highlight hover:border-aruna-highlight focus:outline-none disabled:opacity-50 disabled:pointer-events-none"
                  data-hs-overlay="#ontology-add">
            Add Ontology
          </button>
          <button type="button"
                  @click="ontologyDialogOpen = true"
                  class="ms-4 px-1 inline-flex items-center gap-x-2 m-0.5 p-0.5 border border-gray-300 rounded-md text-gray-300 text-sm hover:text-aruna-700 hover:border-aruna-700 focus:outline-none disabled:opacity-50 disabled:pointer-events-none">
            Add Ontology
          </button>
        </div>

        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-aruna-text/50">
              <table class="min-w-full divide-y divide-aruna-text">
                <thead class="bg-aruna-muted">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">Key
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">Value
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-center text-sm font-bold text-aruna-text-accent uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-aruna-text/50">
                <tr v-for="[key, value] in keyValues">
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium text-aruna-text">
                    {{ key }}
                  </td>
                  <td v-html="prettyDisplayJson(value.value)"
                      class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text"></td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ toKeyValueVariantStr(value.variant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-center text-sm font-medium">
                    <button type="button"
                            @click="removeKeyValue(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-aruna-text hover:text-destructive focus:z-10 focus:outline-none focus:ring-2 focus:text-destructive focus:ring-destructive">
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
                 class="block text-lg font-medium text-gray-300">Additional Relations</label>
          <button type="button"
                  class="ms-4 inline-flex items-center gap-x-2 m-0.5 p-0.5 border border-aruna-text-accent rounded-md text-aruna-text-accent hover:text-aruna-highlight hover:border-aruna-highlight focus:outline-none disabled:opacity-50 disabled:pointer-events-none"
                  data-hs-overlay="#relation-add">
            <IconPlus class="flex-shrink-0 size-4"/>
          </button>
        </div>

        <div class="-m-1.5 overflow-x-auto">
          <div class="p-1.5 min-w-full inline-block align-middle">
            <div class="overflow-hidden border border-aruna-text/50">
              <table class="min-w-full divide-y divide-aruna-text">
                <thead class="bg-aruna-muted">
                <tr>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Resource Id
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Resource Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Relation Type
                  </th>
                  <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                    Direction
                  </th>
                  <th scope="col" class="px-6 py-3 text-center text-sm font-bold text-aruna-text-accent uppercase">
                    Actions
                  </th>
                </tr>
                </thead>
                <tbody class="divide-y divide-aruna-text/50">
                <tr v-for="[key, value] in relations">
                  <td class="px-6 py-2 whitespace-nowrap text-sm font-medium text-aruna-text">
                    {{ value.internal?.resourceId }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ toResourceTypeStr(value.internal?.resourceVariant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ toRelationVariantStr(value.internal?.definedVariant) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                    {{ toRelationDirectionStr(value.internal?.direction) }}
                  </td>
                  <td class="px-6 py-2 whitespace-nowrap text-center text-sm font-medium">
                    <button type="button"
                            @click="removeRelation(key)"
                            class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full text-aruna-text hover:text-destructive focus:z-10 focus:outline-none focus:ring-2 focus:text-destructive focus:ring-destructive">
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
      <Button type="button"
              v-bind:disabled="!validState"
              @click="submit"
              variant="outline"
              class="px-4 py-6 inline-flex text-md rounded-md border border-aruna-highlight bg-transparent text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-aruna-highlight">
        Create Resource
      </Button>
    </div>
  </div>
  </div>
  <AuthorDialog
    :initial-open="authorDialogOpen"
    :with-button="false"
    @update:open="authorDialogOpen = false"
    @add-author="
      (author) => {
        addAuthor(author);
        authorDialogOpen = false;
      }
    "
  />
  <KeyValueDialog
    :initial-open="keyValueDialogOpen"
    :with-button="false"
    @update:open="keyValueDialogOpen = false"
    @add-key-value="
      ({ key, value, variant }) => {
        addKeyValue(key, value, variant);
        keyValueDialogOpen = false;
      }
    "
  />
  <OntologyDialog
      :initial-open="ontologyDialogOpen"
      :with-button="false"
      @update:open="ontologyDialogOpen = false"
      @add-author="
      (author) => {
        // addAuthor(author);
        ontologyDialogOpen = false;
      }
    "
  />
  <ModalOntology modalId="ontology-add" @add-key-value="addKeyValue"/>
  <ModalRelation modalId="relation-add" @add-relation="addRelation"/>
  <ModalObjectDisplay modalId="object-display" :object="createdResource" :progress="uploadProgress"
                      :errorMsg="creationError"/>
  <Footer/>
</template>