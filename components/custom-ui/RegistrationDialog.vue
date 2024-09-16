<script setup lang="ts">
import {IconHelp, IconTrophy} from "@tabler/icons-vue"
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {Input} from '@/components/ui/input'
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover'
import {useToast} from '@/components/ui/toast/use-toast'
import type {v2RegisterUserResponse} from "~/composables/aruna_api_json";
import {useForm} from "vee-validate";
import {toTypedSchema} from '@vee-validate/zod'
import {h} from "vue";
import * as z from 'zod'

const {toast} = useToast()

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => open.value = externalTrigger.value)
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits(['closeRegisterDialog'])
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
  firstName: z.string({required_error: "First name is required."}).min(2).max(128),
  lastName: z.string({required_error: "Last name is required."}).min(2).max(128),
  displayName: z.string({required_error: "Display name is required."}).min(2).max(256),
  email: z.string({required_error: "Valid email is required."}).email('Invalid email format.').trim().min(1),
  project: z.string().optional(),
  tosAccepted: z.boolean({required_error: "Is not active man."}).default(false).refine(val => val, {message: "You have to accept the ToS"})
}))

const form = useForm({
  validationSchema: formSchema,
  initialValues: {
    tosAccepted: false,
  },
})

const onSubmit = form.handleSubmit(async (values) => {
  await $fetch<v2RegisterUserResponse>('/api/register', {
    method: 'POST',
    body: {
      displayName: values.displayName,
      email: values.email,
      project: values.project
    }
  }).then(response => {
    if (response.userId) {
      toast({
        description: h('div',
            {class: 'flex space-x-2 items-center justify-center'},
            [
              h(IconTrophy, {class: 'flex-shrink-0 size-5 text-gray-700'}),
              h('span',
                  {class: 'text-green-900'},
                  ['Your registration was successful. Please check your mails for more information.'])
            ]),
        duration: 10000
      })
      emit('closeRegisterDialog')
    }
  }).catch(error => {
    toast({
      title: 'Error',
      description: error.toString()
    })
  })
})
/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Registration
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-800 font-bold">Aruna Registration</DialogTitle>
        <DialogDescription class="text-center">
          Register for your individual Aruna experience.
        </DialogDescription>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <div class="flex space-x-4">
          <div class="flex flex-col">
            <FormField v-slot="{ componentField }" name="firstName">
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Your first name" v-bind="componentField" class="mt-0"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
          <div class="flex flex-col">
            <FormField v-slot="{ componentField }" name="lastName">
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Your last name" v-bind="componentField"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
        </div>

        <FormField v-slot="{ componentField }" name="displayName">
          <FormItem>
            <div class="flex items-center justify-between">
              <FormLabel>Display Name</FormLabel>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  This name will be publicly displayed for your user.
                </PopoverContent>
              </Popover>
            </div>
            <FormControl>
              <Input type="text" placeholder="An arbitrary display name" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <div class="flex items-center justify-between">
              <FormLabel>Email</FormLabel>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  A valid email address that will only be used to provide you with important notifications.
                </PopoverContent>
              </Popover>
            </div>
            <FormControl>
              <Input type="text" placeholder="A valid email address" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="project">
          <FormItem>
            <FormLabel class="flex items-center justify-between">
              <span>Associated Project</span>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  If available, you can enter the project / consortium you are associated with here.
                </PopoverContent>
              </Popover>
            </FormLabel>
            <FormControl>
              <Input type="text" placeholder="Your NFDI project / consortium" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField type="checkbox" v-slot="{ value, handleChange }" name="tosAccepted">
          <FormItem class="flex flex-row items-start gap-x-3 space-y-0">
            <FormControl>
              <Checkbox :checked="value" @update:checked="handleChange"/>
            </FormControl>
            <div class="space-y-1 leading-none">
              <FormLabel>
                I accept the <a href="/tos" target="_blank"
                                class="text-aruna-800 dark:text-aruna-700 hover:text-aruna-700 dark:hover:text-aruna-600">Terms
                of Service</a>
              </FormLabel>
              <FormMessage/>
            </div>
          </FormItem>
        </FormField>
      </form>

      <DialogFooter>
        <Button type="submit" form="dialogForm" class="bg-aruna-800 hover:bg-aruna-700">
          Submit
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>