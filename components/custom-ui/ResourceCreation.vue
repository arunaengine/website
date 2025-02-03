<script setup lang="ts">
import {IconPlus, IconTrash} from '@tabler/icons-vue'
import {type v2Author} from '~/composables/aruna_api_json'
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText
} from '~/components/ui/tags-input'
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {Input} from "~/components/ui/input";
import {Button} from "~/components/ui/button";
import {useToast} from '~/components/ui/toast/use-toast'

import {ULID_REGEX} from "~/utils/constants"
import EventBus from "~/composables/EventBus";

import {prettyDisplayJson} from "~/composables/utils";
import {toTypedSchema} from "@vee-validate/zod";
import * as z from "zod";
import {useForm} from "vee-validate";

import AuthorDialog from "~/components/custom-ui/dialog/AuthorDialog.vue";
import KeyValueDialog from "~/components/custom-ui/dialog/KeyValueDialog.vue";
import OntologyDialog from "~/components/custom-ui/dialog/OntologyDialog.vue";
import {ResourceVariant, VisibilityClass} from "~/types/aruna-v3-enums";
import type {Author, KeyValue, GroupInfo} from "~/composables/api_wrapper";

import type {CreateProjectResponse, CreateResourceResponse} from "~/composables/api_wrapper";

/* ----- Properties ----- */
interface ResourceCreationProps {
  realms: Realm[],
  groups: GroupInfo[]
}

const props = defineProps<ResourceCreationProps>()
const realms = toRef(() => props.realms)
const groups = toRef(() => props.groups)
watch(groups, () => console.log('[ResourceCreation] Updated groups:', groups.value))
/* ----- End Properties ----- */

// Use route to evaluate query parameter
const route = useRoute()
const licenses = [
  {tag: 'CC0', label: 'Creative Commons Zero (CC0 1.0)'},
  {tag: 'CC-BY-SA', label: 'Attribution-ShareAlike 4.0 International (CC-BY-SA 4.0)'},
  {tag: 'CC-BY-NC', label: 'Attribution-NonCommercial 4.0 International (CC-BY-NC)'},
  {tag: 'CC-BY-NC-SA', label: 'Attribution-NonCommercial-ShareAlike 4.0 International (CC-BY-NC-SA)'}
] //await fetchLicenses()

const createdResource: Ref<Resource | undefined> = ref(undefined)
const creationError: Ref<string | undefined> = ref(undefined)

/* ----- Query Parameter Evaluation ----- */
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
      //resourceType.value = fromResourceTypeStr(resourceTypeParam, v2ResourceVariant.RESOURCE_VARIANT_PROJECT);
    }
    const dataClassParam = getParamSingle("class");
    if (dataClassParam) {
      //resourceDataclass.value = fromDataClassStr(dataClassParam);
    }
    const parentIdParam = getParamSingle("parentId");
    if (parentIdParam) {
      //resourceParentId.value = parentIdParam;
    }

    /*
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
    */
  }
}

onMounted(() => setQueryParams());
/* ----- End Query Parameter Evaluation ----- */

/* ----- Form Schema ----- */
const formSchema = toTypedSchema(z.object({
  name: z.string(),
  title: z.string(),
  description: z.string().max(1024, 'Description length is limited to 1024 characters.'),
  identifiers: z.array(z.string()).optional(),
  visibility: z.nativeEnum(VisibilityClass),
  variant: z.nativeEnum(ResourceVariant),
  realm_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  group_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  parent_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  license_tag: z.string(),
  authors: z.array(z.custom<Author>()).optional(),
  labels: z.array(z.custom<KeyValue>()).optional(),
  file: z.custom<File>().optional()
}).superRefine((values, ctx) => {
  if (values.variant !== ResourceVariant.Project && !values.parent_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Parent id is required',
      path: ['parent_id'],
    })
  }
  if (values.variant === ResourceVariant.Project && !values.realm_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Realm id is required',
      path: ['realm_id'],
    })
  }
  if (values.variant === ResourceVariant.Project && !values.group_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Group id is required',
      path: ['group_id'],
    })
  }

  if (values.variant === ResourceVariant.Object && !values.file) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'File is required for an Object',
      path: ['file'],
    })
  }
  //console.dir('[Form Super Refine] Context:', ctx)
  return ctx
}))

const {handleSubmit, values, setFieldValue} = useForm({
  validationSchema: formSchema,
  initialValues: {
    identifiers: [],
    visibility: VisibilityClass.Public,
    variant: ResourceVariant.Project,
    license_tag: 'CC0',
    authors: [],
    labels: []
  },
  keepValuesOnUnmount: true,
})

const {toast} = useToast()
const onSubmit = handleSubmit(async (values) => {
  const request = {
    name: values.name,
    title: values.title,
    description: values.description,
    variant: values.variant === ResourceVariant.Project ? undefined : values.variant,
    realm_id: values.variant === ResourceVariant.Project ? values.realm_id : undefined,
    group_id: values.variant === ResourceVariant.Project ? values.group_id : undefined,
    parent_id: values.variant !== ResourceVariant.Project ? values.parent_id : undefined,
    visibility: values.visibility,
    identifiers: values.identifiers,
    license_tag: values.license_tag,
    authors: Array.from(authors.value.values()),
    labels: Array.from(keyValues.value.values()),
  }

  toast({
    title: 'You submitted the following values:',
    description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'}, h('code', {class: 'text-white'}, JSON.stringify(request, null, 2))),
  })

  // Create resource in Aruna
  const api_endpoint = values.variant === ResourceVariant.Project ? '/api/v3/project' : '/api/v3/resource'
  const response = await $fetch<CreateProjectResponse | CreateResourceResponse>(api_endpoint, {
    method: 'POST',
    body: request
  }).then(response => {
    console.log('[Resource Creation] Response:', response)
    if (values.variant === ResourceVariant.Project)
      EventBus.emit('updateProjects')

    return response
  }).catch(error => {
    console.log('[Resource Creation] Error:', error.data.data)
    toast({
      title: 'Error',
      description: `Resource creation failed: ${error.data.data}`
    })

    return {resource: undefined}
  })

  // Upload data if Object
  if (response.resource && values.variant === ResourceVariant.Object) {
    toast({
      title: 'Info',
      description: 'This is the moment where your data would be upload.'
    })
  }
})
/* ----- End Form Schema ----- */

/* ----- Resource Authors ----- */
const authors: Ref<Map<string, Author>> = ref(new Map())
function addAuthor(author: Author) {
  authors.value.set(getUniqueId(), author)
}

function removeAuthor(key: string) {
  authors.value.delete(key)
}

/* ----- End Resource Authors ----- */

/* ----- Resource key-values ----- */
const keyValues: Ref<Map<string, KeyValue>> = ref(new Map())
function addKeyValue(keyValue: KeyValue) {
  keyValues.value.set(keyValue.key, keyValue)
}

function removeKeyValue(key: string) {
  keyValues.value.delete(key)
}

/* ----- End Resource key-values ----- */

/* ----- Upload ----- */
const uploadProgress = ref(0)

function updateProgress(current: number, total: number | undefined) {
  if (!total)
    return 0
  const floatProgress = current / total * 100
  uploadProgress.value = +floatProgress.toFixed(2)
}

/* ----- End Upload ----- */

// ----- Helper functions -----
let id = 0
function getUniqueId(): string {
  return id++ + '';
}
// ----- End Helper functions -----

/*
function textAreaAutoHeight(domElement: HTMLTextAreaElement | null, offset = 0) {
  if (domElement) {
    domElement.style.height = 'auto'
    domElement.style.height = `${domElement.scrollHeight + offset}px`
  }
}
*/

/*
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
        preferredEndpoint: '',
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
*/

/*
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
*/
//const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))
</script>

<template>
  <!-- Resource Creation Form -->
  <div class="m-4 flex flex-col grow h-full border border-dashed border-aruna-text/50 rounded-md p-6 gap-y-6">
    <h1 class="text-3xl font-bold text-aruna-text-accent">
      Resource creation
    </h1>
    <Separator class="bg-aruna-text/50"/>

    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel id="resource-creation-left">
        <div class="flex flex-col basis-1/2 h-full p-4">
          <form id="dialogForm" @submit="onSubmit" class="flex flex-col space-y-4 grow">
            <!-- Name Input -->
            <FormField v-slot="{componentField}" name="name">
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input type="text"
                         placeholder="Name of the new resource"
                         v-bind="componentField"
                         class="py-2 px-3 h-auto w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                disabled:opacity-50 disabled:pointer-events-none"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Name Input -->

            <!-- Title Input -->
            <FormField v-slot="{componentField}" name="title">
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input type="text"
                         placeholder="Title of the new resource"
                         v-bind="componentField"
                         class="py-2 px-3 h-auto w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                disabled:opacity-50 disabled:pointer-events-none"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Title Input -->

            <!-- Description Input -->
            <FormField v-slot="{componentField}" name="description">
              <FormItem>
                <FormLabel class="flex justify-between">
                  Description
                  <span class="text-xs text-aruna-text"
                        :class="{'text-destructive': values.description ? values.description?.length > 1024 : false}">
                      Characters left: {{ values.description ? 1024 - values.description.length : 1024 }}
                  </span>
                </FormLabel>
                <FormControl class="flex">
                  <Textarea v-bind="componentField"
                            :rows="5"
                            placeholder="Here you can enter a description of your resource"
                            class="py-3 px-4 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                   focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                   focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                   disabled:opacity-50 disabled:pointer-events-none"/>
                  <div class="flex w-full pe-4 justify-end text-aruna-text">
                  </div>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Description Input -->

            <!-- Identifiers Input -->
            <FormField v-slot="{ value }" name="identifiers">
              <FormItem>
                <FormLabel>External Identifiers</FormLabel>
                <FormControl class="bg-aruna-muted">
                  <TagsInput :model-value="value" class="p-0">
                    <TagsInputItem v-for="item in value" :key="item" :value="item"
                                   class="py-3 px-2 bg-aruna-fg text-aruna-text-accent">
                      <TagsInputItemText/>
                      <TagsInputItemDelete/>
                    </TagsInputItem>
                    <TagsInputInput placeholder="Other external identifiers e.g. DOI or ENA accession"
                                    class="py-3 px-4 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                           focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                           focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                           disabled:opacity-50 disabled:pointer-events-none"/>
                  </TagsInput>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Identifiers Input -->

            <!-- Type Input -->
            <FormField v-slot="{ componentField }" type="radio" name="variant">
              <FormItem class="space-y-3">
                <FormLabel>Resource Type</FormLabel>
                <FormControl>
                  <RadioGroup class="flex gap-x-0"
                              v-bind="componentField"
                              orientation="horizontal">
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="ResourceVariant.Project"/>
                      </FormControl>
                      <FormLabel class="font-normal">Project</FormLabel>
                    </FormItem>
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="ResourceVariant.Folder"/>
                      </FormControl>
                      <FormLabel class="font-normal">Folder</FormLabel>
                    </FormItem>
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="ResourceVariant.Object"/>
                      </FormControl>
                      <FormLabel class="font-normal">Object</FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Type Input -->

            <div class="flex gap-x-4">
              <!-- Realm Input -->
              <FormField v-slot="{componentField}" name="realm_id">
                <FormItem v-if="values.variant === ResourceVariant.Project"
                          class="flex flex-col basis-1/2 space-y-4">
                  <FormLabel>Realm Selection</FormLabel>
                  <Select v-bind="componentField">
                    <FormControl>
                      <SelectTrigger class="bg-aruna-muted">
                        <SelectValue placeholder="Select a realm for your project"/>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent class="bg-aruna-bg/90">
                      <SelectGroup>
                        <SelectItem v-for="realm in realms" :value="realm.id"
                                    class="hover:bg-aruna-fg">
                          {{ realm.name }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage/>
                </FormItem>
              </FormField>
              <!-- Realm Input -->

              <!-- Group Input -->
              <FormField v-slot="{componentField}" name="group_id">
                <FormItem v-if="values.variant === ResourceVariant.Project"
                          class="flex flex-col basis-1/2 space-y-4">
                  <FormLabel>Group Selection</FormLabel>
                  <Select v-bind="componentField">
                    <FormControl>
                      <SelectTrigger class="bg-aruna-muted">
                        <SelectValue placeholder="Select an administration group for your project"/>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent class="bg-aruna-bg/90">
                      <SelectGroup>
                        <SelectItem v-for="group in groups" :value="group.group.id"
                                    class="hover:bg-aruna-fg">
                          {{ group.group.name }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage/>
                </FormItem>
              </FormField>
              <!-- Group Input -->
            </div>


            <!-- Parent Id Input -->
            <FormField v-slot="{componentField}"
                       name="parent_id">
              <FormItem v-if="values.variant !== ResourceVariant.Project">
                <FormLabel>Parent Id</FormLabel>
                <FormControl>
                  <div class="flex rounded-sm">
                    <span class="px-4 inline-flex items-center min-w-fit rounded-s-sm border border-e-0 border-aruna-highlight bg-transparent text-sm text-aruna-highlight">
                      Unspecified
                    </span>
                    <Input type="text"
                           placeholder="Id of the new resources direct parent"
                           v-bind="componentField"
                           class="py-2 px-3 pe-11 block w-full border-gray-200 shadow-sm rounded-s-none rounded-e-lg text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:placeholder-neutral-500 dark:focus:ring-neutral-600"/>
                  </div>
                  <!--
                  <Input type="text"
                         placeholder="Id of the new resources direct parent"
                         v-bind="componentField"
                         class="mt-0"/>
                  -->
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Parent Id Input -->

            <!-- File Input -->
            <FormField name="file">
              <FormItem class="invisible h-0"
                        :class="{'visible h-auto': values.variant === ResourceVariant.Object}">
                <FormLabel>File Select/Drag</FormLabel>
                <FormControl>
                  <input type="file"
                         v-on:change="(v) => setFieldValue('file', v)"
                         name="file-input"
                         id="file-input"
                         class="block w-full p-0 border border-aruna-text/50 shadow-sm rounded-md bg-aruna-muted text-aruna-text text-sm focus:z-10 focus:border-aruna-text/50 focus:ring-aruna-highlight disabled:opacity-50 disabled:pointer-events-none
                            file:bg-aruna-fg
                            file:text-aruna-text-accent
                            file:border-0
                            file:me-4
                            file:p-2">
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- File Id Input -->

            <!-- Visibility Input -->
            <FormField v-slot="{ componentField }" type="radio" name="visibility">
              <FormItem class="space-y-3">
                <FormLabel>Resource Visibility</FormLabel>
                <FormControl>
                  <RadioGroup class="flex gap-x-0"
                              v-bind="componentField"
                              orientation="horizontal">
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="VisibilityClass.Public"/>
                      </FormControl>
                      <FormLabel class="font-normal">
                        Public
                      </FormLabel>
                    </FormItem>
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="VisibilityClass.PublicMetadata"/>
                      </FormControl>
                      <FormLabel class="font-normal">
                        Only Metadata Public
                      </FormLabel>
                    </FormItem>
                    <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                      <FormControl>
                        <RadioGroupItem :value="VisibilityClass.Private"/>
                      </FormControl>
                      <FormLabel class="font-normal">
                        Private
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End Visibility Input -->

            <!-- License Input -->
            <FormField v-slot="{componentField}" name="license_tag">
              <FormItem>
                <FormLabel>License</FormLabel>
                <Select v-bind="componentField">
                  <FormControl>
                    <SelectTrigger class="bg-aruna-muted">
                      <SelectValue placeholder="Select a license for your resource"/>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent class="bg-aruna-bg/90">
                    <SelectGroup>
                      <SelectItem v-for="license in licenses" :value="license.tag"
                                  class="hover:bg-aruna-fg">
                        {{ license.label }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage/>
              </FormItem>
            </FormField>
            <!-- End License Input -->
          </form>
        </div>
      </ResizablePanel>
      <ResizableHandle id="resource-creation-handle" with-handle class="bg-aruna-text/50"/>
      <ResizablePanel id="resource-creation-right"
                      :default-size="60"
                      :min-size="25"
                      :max-size="75"
                      :collapsible="true">
        <div class="flex flex-col basis-1/2 h-full p-4">
          <div class="flex px-4 grow flex-row md:flex-col overflow-x-auto">
            <div class="flex flex-row mb-2 justify-start items-center gap-x-4">
              <span class="block text-lg font-medium text-aruna-text-accent">Authors</span>
              <AuthorDialog :initial-open="false"
                            :with-button="true"
                            button-css="h-auto p-0.5 px-1 rounded-md font-normal text-aruna-highlight border-aruna-highlight hover:border-aruna-highlight/80 hover:bg-transparent hover:text-aruna-highlight/80"
                            button-label="Add"
                            @add-author="(author: Author) => addAuthor(author)"/>
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
                        External Identifier
                      </th>
                      <th scope="col" class="px-6 py-3 text-center text-sm font-bold text-aruna-text-accent uppercase">
                        Actions
                      </th>
                    </tr>
                    </thead>
                    <tbody class="divide-y divide-aruna-text/50">
                    <tr v-for="[key, author] in authors">
                      <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                        {{ author.first_name }} {{ author.last_name }}
                      </td>
                      <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                        {{ author.email }}
                      </td>
                      <td class="px-6 py-2 whitespace-nowrap text-sm text-aruna-text">
                        {{ author.identifier }}
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

            <div class="flex flex-row mb-2 mt-6 justify-start items-center gap-x-4">
              <span class="block text-lg font-medium text-aruna-text-accent">Key-Values</span>

              <KeyValueDialog :initial-open="false"
                              :with-button="true"
                              button-css="h-auto p-0.5 px-1 rounded-md font-normal text-aruna-highlight border-aruna-highlight hover:border-aruna-highlight/80 hover:bg-transparent hover:text-aruna-highlight/80"
                              button-label="Add"
                              @add-key-value="(keyValue: KeyValue) => addKeyValue(keyValue)"/>

              <OntologyDialog :initial-open="false"
                              :with-button="true"
                              button-css="h-auto p-0.5 px-1 rounded-md font-normal text-aruna-highlight border-aruna-highlight hover:border-aruna-highlight/80 hover:bg-transparent hover:text-aruna-highlight/80"
                              @add-key-value="(keyValue: KeyValue) => addKeyValue(keyValue)"/>
            </div>

            <div class="-m-1.5 overflow-x-auto">
              <div class="p-1.5 min-w-full inline-block align-middle">
                <div class="overflow-hidden border border-aruna-text/50">
                  <table class="min-w-full divide-y divide-aruna-text">
                    <thead class="bg-aruna-muted">
                    <tr>
                      <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                        Key
                      </th>
                      <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                        Value
                      </th>
                      <th scope="col" class="px-6 py-3 text-start text-sm font-bold text-aruna-text-accent uppercase">
                        Locked
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
                        {{ value.locked }}
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

          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <Button type="submit"
            form="dialogForm"
            variant="outline"
            class="w-fit bg-transparent border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
      Create Resource
    </Button>
  </div>
  <!-- End Resource Creation Form -->

  <!-- TODO: Refactor (?) -->
  <ModalObjectDisplay modalId="object-display"
                      :object="createdResource"
                      :progress="uploadProgress"
                      :errorMsg="creationError"/>
</template>