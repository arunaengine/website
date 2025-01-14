<script setup lang="ts">
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form'
import {Input} from '@/components/ui/input'
import type {CreateComponentRequest, Endpoint, v3Component} from "~/composables/api_wrapper";
import {useForm} from 'vee-validate'
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean
  withButton: boolean
  buttonCss?: string,
  realmId?: string
}>()
const realmId = toRef(() => props.realmId)
const externalTrigger = toRef(() => props.initialOpen)
const open = ref(props.initialOpen)
watch(realmId, () => {
  console.info('[RealmComponentDialog] Updated realmId: ', realmId.value)
  setFieldValue('realm_id', realmId.value)
})
watch(externalTrigger, () => (open.value = externalTrigger.value))
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits<{
  'add-component': [component: v3Component]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
    realm_id: z.string().optional(),
    name: z.string({required_error: 'Name is required.'}).min(2).max(256),
    pubkey: z.string({required_error: 'Public key is required.'}).min(2).max(256),
    description: z.string().optional(),
    public: z.boolean(),
    component_type: z.nativeEnum(ComponentType),
    s3_endpoint: z.custom<{S3: string}>().optional(),
    grpc_endpoint: z.custom<{Grpc: string}>().optional(),
    json_endpoint: z.custom<{Json: string}>().optional(),
    consensus_endpoint: z.custom<{Consensus: string}>().optional()
  })
)

const {handleSubmit, values, setFieldValue} = useForm({
  validationSchema: formSchema,
  initialValues: {
    //component_type: ComponentType.Server,
    public: true,
  }
})

import {useToast} from '~/components/ui/toast/use-toast'
import {Checkbox} from "~/components/ui/checkbox";
import {ComponentType, ResourceVariant} from "~/types/aruna-v3-enums";
const {toast} = useToast()
const onSubmit = handleSubmit(async (values) => {
  console.info('[RealmComponentDialog] Submitted values: ', values)

  // Collect endpoints
  let endpoints: Endpoint[] = []
  if (values.s3_endpoint)
    endpoints.push(values.s3_endpoint)
  if (values.json_endpoint)
    endpoints.push(values.json_endpoint)
  if (values.grpc_endpoint)
    endpoints.push(values.grpc_endpoint)
  if (values.consensus_endpoint)
    endpoints.push(values.consensus_endpoint)

  const request = {
    public: values.public,
    name: values.name,
    pubkey: values.pubkey,
    description: values.description,
    component_type: values.component_type,
    endpoints: endpoints
  } as CreateComponentRequest

  /*
  toast({
    title: 'You submitted the following values:',
    description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'}, h('code', {class: 'text-white'}, JSON.stringify(request, null, 2))),
  })
  */

  //Create component
  await $fetch<CreateComponentResponse>('/api/v3/components', {
    method: 'POST',
    body: request
  }).then(response => {
    toast({
      title: 'Success',
      description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'}, h('code', {class: 'text-white'}, JSON.stringify(response, null, 2))),
    })

    // Add created component to realm
    return $fetch<AddComponentToRealmResponse>('/api/v3/components', {
      method: 'PATCH',
      body: {
        realm_id: values.realm_id,
        component_id: response.component.id
      }
    })

  }).then(response => {
    toast({
      title: 'Success',
      description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'}, h('code', {class: 'text-white'}, JSON.stringify(response, null, 2))),
    })
    emit('add-component', response.component)
    open.value = false

  }).catch(error => {
    toast({
      variant: "destructive",
      title: 'Error',
      description: h('pre', {class: 'mt-2 w-[500px] rounded-md bg-slate-950 p-4'}, h('code', {class: 'text-white'}, JSON.stringify(error.data, null, 2))),
    })
  })

  //TODO: Emit event
})

/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline"
              :class="cn('rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent', props.buttonCss)">
        Add Realm Component
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[500px] sm:rounded-md" @pointer-down-outside="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-700 font-bold">
          Add Realm Component
        </DialogTitle>
        <DialogDescription class="flex flex-col gap-y-4 justify-start">
          Add a new component to your realm.
          <pre>{{ JSON.stringify(values, null, 2) }}</pre>
        </DialogDescription>
      </DialogHeader>

      <form id="createComponentForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{componentField}" name="realm_id">
          <FormItem class="invisible h-0">
            <FormControl>
              <Input type="text"
                     v-bind="componentField"
                     placeholder="Id of the realm the component will be created for"
                     class="mt-0"/>
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="component_type">
          <FormItem>
            <FormLabel>Type</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type for your component" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="type in ComponentType" class="" :value="type">
                    {{ type }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="name">
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input type="text"
                     v-bind="componentField"
                     placeholder="Name of the component"
                     class="mt-0" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="pubkey">
          <FormItem>
            <FormLabel>Public Key</FormLabel>
            <FormControl>
              <Input type="text"
                     v-bind="componentField"
                     placeholder="Public key of the component"
                     class="mt-0 w-full truncate overflow-ellipsis" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <!-- Endpoints Input -->
        <div class="flex flex-col gap-y-0">
          <FormField v-slot="{componentField}"
                     name="s3_endpoint">
            <FormItem>
              <FormLabel>Endpoints</FormLabel>
              <FormControl>
                <div class="flex rounded-sm">
                    <span class="min-w-[75px] px-4 inline-flex items-center rounded-s-sm border border-e-0 bg-transparent text-sm text-aruna-highlight">
                      S3
                    </span>
                  <Input type="text"
                         placeholder="S3 endpoint URL of the component"
                         @update:model-value="(v) => {setFieldValue('s3_endpoint', v ? {S3: v.toString()} : undefined)}"
                         class="mt-0 rounded-s-none focus:outline-0 focus:ring-1
                                focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                disabled:opacity-50 disabled:pointer-events-none"/>

                </div>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>

          <FormField v-slot="{componentField}"
                     name="grpc_endpoint">
            <FormItem>
              <FormControl>
                <div class="flex rounded-sm">
                    <span class="min-w-[75px] px-4 inline-flex items-center rounded-s-sm border border-e-0 bg-transparent text-sm text-aruna-highlight">
                      gRPC
                    </span>
                  <Input type="text"
                         placeholder="gRPC endpoint URL of the component"
                         @update:model-value="(v) => {setFieldValue('grpc_endpoint', v ? {Grpc: v.toString()} : undefined)}"
                         class="mt-0 rounded-s-none"/>
                </div>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <FormField v-slot="{componentField}"
                     name="json_endpoint">
            <FormItem>
              <FormControl>
                <div class="flex rounded-sm">
                    <span class="min-w-[75px] px-4 inline-flex items-center rounded-s-sm border border-e-0 bg-transparent text-sm text-aruna-highlight">
                      JSON
                    </span>
                  <Input type="text"
                         placeholder="JSON endpoint URL of the component"
                         @update:model-value="(v) => {setFieldValue('json_endpoint', v ? {Json: v.toString()} : undefined)}"
                         class="mt-0 rounded-s-none"/>
                </div>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
          <FormField v-slot="{componentField}"
                     name="consensus_endpoint">
            <FormItem>
              <FormControl>
                <div class="flex rounded-sm">
                    <span class="min-w-[75px] px-4 inline-flex items-center rounded-s-sm border border-e-0 bg-transparent text-sm text-aruna-highlight">
                      Cons.
                    </span>
                  <Input type="text"
                         placeholder="Consensus endpoint URL of the component"
                         @update:model-value="(v) => {setFieldValue('consensus_endpoint', v ? {Consensus: v.toString()} : undefined)}"
                         class="mt-0 rounded-s-none"/>
                </div>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
        </div>
        <!-- End Endpoints Input -->

        <FormField v-slot="{componentField}" name="description">
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea v-bind="componentField"
                        :rows="5"
                        placeholder="A concise description of the component" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField type="checkbox" v-slot="{ value, handleChange }" name="public">
          <FormItem class="flex flex-row items-start gap-x-3 space-y-0">
            <FormControl>
              <Checkbox :checked="value" @update:checked="handleChange" class="data-[state=checked]:bg-aruna-highlight data-[state=checked]:text-aruna-text-accent"/>
            </FormControl>
            <div class="space-y-1 leading-none">
              <FormLabel>
                This component is publicly available
              </FormLabel>
              <FormMessage/>
            </div>
          </FormItem>
        </FormField>

      </form>
      <DialogFooter>
        <Button type="submit"
                form="createComponentForm"
                class="w-fit bg-transparent border border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
          Create Component
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
