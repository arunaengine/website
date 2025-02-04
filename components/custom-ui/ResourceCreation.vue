<script setup lang="ts">
import {IconLock, IconLockOpen2, IconPlus, IconTrash} from '@tabler/icons-vue'
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
import AuthorDialog from "~/components/custom-ui/dialog/AuthorDialog.vue";
import KeyValueDialog from "~/components/custom-ui/dialog/KeyValueDialog.vue";
import OntologyDialog from "~/components/custom-ui/dialog/OntologyDialog.vue";

import {ULID_REGEX} from "~/utils/constants"
import EventBus from "~/composables/EventBus";

import type {Author, KeyValue, GroupInfo} from "~/composables/api_wrapper";
import type {CreateProjectResponse, CreateResourceResponse} from "~/composables/api_wrapper";
import {ResourceVariant, VisibilityClass} from "~/types/aruna-v3-enums";

import {prettyDisplayJson} from "~/composables/utils";
import {toTypedSchema} from "@vee-validate/zod";
import * as z from "zod";
import {useForm} from "vee-validate";


// ----- Properties ---------- //
interface ResourceCreationProps {
  realms: Realm[],
  groups: GroupInfo[],
  licenses: License[],
  realmContext: RealmContext,
}

const props = defineProps<ResourceCreationProps>()
const realms = toRef(() => props.realms)
const groups = toRef(() => props.groups)
const licenses = toRef(() => props.licenses)
const context = toRef(() => props.realmContext)
watch(groups, () => console.log('[ResourceCreation] Updated context:', context.value))
watch(groups, () => console.log('[ResourceCreation] Updated groups:', groups.value))
// ----- End Properties ---------- //

// ----- Query Parameter Evaluation ---------- //
const route = useRoute() // Use route to evaluate query parameter

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
  }
}

onMounted(() => setQueryParams());
// ----- End Query Parameter Evaluation ---------- //

// ----- Form Schema ---------- //
const formSchema = toTypedSchema(z.object({
  name: z.string(),
  title: z.string(),
  description: z.string().max(1024, 'Description length is limited to 1024 characters.'),
  //identifiers: z.array(z.string()).optional(),
  visibility: z.nativeEnum(VisibilityClass),
  variant: z.nativeEnum(ResourceVariant),
  realm_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  group_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  parent_id: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  license_id: z.string(),
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
    //identifiers: [],
    visibility: VisibilityClass.Public,
    variant: ResourceVariant.Project,
    license_id: licenses.value[0].id,
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
    license_id: values.license_id,
    identifiers: identifiers.value, //values.identifiers,
    authors: Array.from(authors.value.values()),
    labels: Array.from(keyValues.value.values()),
  } as CreateResourceRequest

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

// ----- External Resource Identifiers ---------- //
const identifiers = ref<string[]>([])

// ----- Resource Authors ---------- //
const authors: Ref<Map<string, Author>> = ref(new Map())

function addAuthor(author: Author) {
  authors.value.set(getUniqueId(), author)
}

function removeAuthor(key: string) {
  authors.value.delete(key)
}

// ----- Resource key-values ---------- //
const keyValues: Ref<Map<string, KeyValue>> = ref(new Map())

function addKeyValue(keyValue: KeyValue) {
  keyValues.value.set(keyValue.key, keyValue)
}

function removeKeyValue(key: string) {
  keyValues.value.delete(key)
}

// ----- Created resource info | Upload ---------- //
const createdResource: Ref<Resource | undefined> = ref(undefined)
const creationError: Ref<string | undefined> = ref(undefined)
const uploadProgress = ref(0)

function updateProgress(current: number, total: number | undefined) {
  if (!total)
    return 0
  const floatProgress = current / total * 100
  uploadProgress.value = +floatProgress.toFixed(2)
}

// ----- Helper functions ---------- //
let id = 0

function getUniqueId(): string {
  return id++ + '';
}

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
</script>

<template>
  <!-- Resource Creation Form -->
  <div class="m-4 flex flex-col grow h-full max-w-screen-2xl border border-dashed border-aruna-text/50 rounded-md p-6 gap-y-4">
    <h1 class="text-3xl font-bold text-aruna-text-accent">
      Resource creation
    </h1>
    <Separator class="bg-aruna-text/50"/>

    <div class="flex flex-col basis-1/2 h-full p-4 pt-0">
      <form id="dialogForm"
            @submit="onSubmit"
            class="flex flex-col space-y-4 grow">
        <!-- Type / Visibility row -->
        <div class="flex flex-col lg:flex-row w-full gap-4">
          <!-- Type Input -->
          <FormField v-slot="{ componentField }" type="radio" name="variant">
            <FormItem class="basis-1/2 space-y-3">
              <FormLabel>Resource Type</FormLabel>
              <FormControl>
                <RadioGroup class="flex gap-x-0"
                            v-bind="componentField"
                            orientation="horizontal">
                  <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                    <FormControl>
                      <RadioGroupItem :value="ResourceVariant.Project"/>
                    </FormControl>
                    <FormLabel class="font-bold">Project</FormLabel>
                  </FormItem>
                  <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                    <FormControl>
                      <RadioGroupItem :value="ResourceVariant.Folder"/>
                    </FormControl>
                    <FormLabel class="font-bold">Folder</FormLabel>
                  </FormItem>
                  <FormItem class="flex p-4 gap-x-3 space-y-0 items-center justify-center first:rounded-s-sm last:rounded-e-sm border border-aruna-highlight">
                    <FormControl>
                      <RadioGroupItem :value="ResourceVariant.Object"/>
                    </FormControl>
                    <FormLabel class="font-bold">Object</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <!-- End Type Input -->
          <!-- Visibility Input -->
          <FormField v-slot="{ componentField }" type="radio" name="visibility">
            <FormItem class="basis-1/2 space-y-3">
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
        </div>
        <!-- End Type / Visibility row -->

        <!-- Name/Title row -->
        <div class="flex flex-col lg:flex-row w-full gap-4">
          <!-- Name Input -->
          <FormField v-slot="{componentField}" name="name">
            <FormItem class="basis-1/2">
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input type="text"
                       placeholder="Name of the new resource"
                       v-bind="componentField"
                       class="py-2 px-3 h-auto w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                              focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                              focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                              disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <!-- End Name Input -->

          <!-- Title Input -->
          <FormField v-slot="{componentField}" name="title">
            <FormItem class="basis-1/2">
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input type="text"
                       placeholder="Title of the new resource"
                       v-bind="componentField"
                       class="py-2 px-3 h-auto w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <!-- End Title Input -->
        </div>
        <!-- End Name/Title row -->

        <!-- Identifiers Input -->
        <TagsInput v-model="identifiers" class="p-0" :class="{'gap-0': identifiers.length === 0}">
          <div class="flex">
          <TagsInputItem v-for="item in identifiers" :key="item" :value="item"
                         class="py-3 px-2 rounded-sm border border-aruna-highlight bg-aruna-bg items-center text-aruna-highlight">
            <TagsInputItemText/>
            <TagsInputItemDelete/>
          </TagsInputItem>
          </div>
          <TagsInputInput placeholder="Other external identifiers e.g. DOI or ENA accession"
                          class="py-1.5 px-2 w-full border-aruna-text/50 rounded-md bg-aruna-muted text-aruna-text-accent text-sm
                                 focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                 focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                 disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
        </TagsInput>
        <!-- End Identifiers Input -->

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
                                   disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
              <div class="flex w-full pe-4 justify-end text-aruna-text">
              </div>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
        <!-- End Description Input -->

        <div class="flex flex-col xl:flex-row gap-4">
          <!-- Parent Id Input -->
          <FormField v-slot="{componentField}"
                     name="parent_id">
            <FormItem v-if="values.variant !== ResourceVariant.Project" class="w-full lg:basis-1/2">
              <FormLabel>Parent Id</FormLabel>
              <FormControl>
                <div class="flex rounded-sm">
                    <span class="px-4 py-2 inline-flex items-center min-w-fit rounded-s-sm border border-aruna-highlight bg-transparent text-sm text-aruna-highlight">
                      Unspecified
                    </span>
                  <Input type="text"
                         placeholder="Id of the new resource's direct parent."
                         v-bind="componentField"
                         class="py-2 px-3 h-auto w-full border-s-0 border-aruna-text/50 rounded-s-none rounded-e-sm bg-aruna-muted text-aruna-text-accent text-sm
                                placeholder:text-aruna-text
                                focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                disabled:opacity-50 disabled:pointer-events-none"/>
                </div>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <!-- End Parent Id Input -->

          <!-- Realm Input -->
          <FormField v-slot="{componentField}" name="realm_id">
            <FormItem v-if="values.variant === ResourceVariant.Project"
                      class="flex flex-col grow space-y-4">
              <FormLabel>Realm Selection</FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="bg-aruna-muted border-aruna-text/50">
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
                      class="flex flex-col grow space-y-4">
              <FormLabel>Group Selection</FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="bg-aruna-muted border-aruna-text/50">
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

          <!-- License Input -->
          <FormField v-slot="{componentField}" name="license_id">
            <FormItem class="w-full lg:basis-1/3">
              <FormLabel>License</FormLabel>
              <Select v-bind="componentField">
                <FormControl>
                  <SelectTrigger class="rounded-sm bg-aruna-muted border-aruna-text/50">
                    <SelectValue placeholder="Select a license for your resource"/>
                  </SelectTrigger>
                </FormControl>
                <SelectContent class="bg-aruna-bg/90">
                  <SelectGroup>
                    <SelectItem v-for="license in licenses"
                                :value="license.id"
                                class="hover:bg-aruna-fg">
                      {{ license.name }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage/>
            </FormItem>
          </FormField>
          <!-- End License Input -->
        </div>

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
      </form>

      <!-- Authors -->
      <div class="flex flex-row mb-2 justify-start items-center gap-x-4">
        <span class="block text-lg font-medium text-aruna-text-accent">Authors</span>
        <AuthorDialog :initial-open="false"
                      :with-button="true"
                      button-css="h-auto p-0.5 px-1 rounded-md font-normal text-aruna-highlight border-aruna-highlight hover:border-aruna-highlight/80 hover:bg-transparent hover:text-aruna-highlight/80"
                      button-label="Add"
                      @add-author="(author: Author) => addAuthor(author)"/>
      </div>
      <Table class="table-auto">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>External Identifier</TableHead>
            <TableHead class="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="[key, author] in authors" :key="key">
            <TableCell class="font-medium">
              {{ author.first_name }} {{ author.last_name }}
            </TableCell>
            <TableCell>{{ author.email }}</TableCell>
            <TableCell>{{ author.identifier }}</TableCell>
            <TableCell class="text-center">
              <Button type="button"
                      @click="removeAuthor(key)"
                      class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full bg-transparent text-aruna-text hover:bg-transparent hover:text-destructive focus:outline-none focus:ring-2 focus:text-destructive focus:ring-destructive">
                <IconTrash class="flex-shrink-0 size-6"/>
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <!-- End Authors -->

      <!-- Labels -->
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
      <Table class="table-auto">
        <TableHeader>
          <TableRow>
            <TableHead class="max-w-[50px]">Locked</TableHead>
            <TableHead class="w-fit">Key</TableHead>
            <TableHead>Value</TableHead>
            <TableHead class="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="[key, value] in keyValues" :key="key">
            <TableCell class="font-medium max-w-[50px]">
              <IconLock v-if="value.locked" class="m-0.5 flex-shrink-0 size-5"/>
              <IconLockOpen2 v-else class="m-0.5 flex-shrink-0 size-5"/>
            </TableCell>
            <TableCell class="w-fit">{{ key }}</TableCell>
            <TableCell v-html="prettyDisplayJson(value.value)"/>
            <TableCell class="text-center">
              <Button type="button"
                      @click="removeKeyValue(key)"
                      class="inline-flex flex-shrink-0 justify-center items-center size-8 rounded-full bg-transparent text-aruna-text hover:bg-transparent hover:text-destructive focus:outline-none focus:ring-2 focus:text-destructive focus:ring-destructive">
                <IconTrash class="flex-shrink-0 size-6"/>
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <!-- End Labels -->
    </div>

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