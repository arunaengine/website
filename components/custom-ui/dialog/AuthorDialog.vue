<script setup lang="ts">
import {IconHelp} from "@tabler/icons-vue"
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
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {Input} from '@/components/ui/input'
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover'
import type {v2Author} from "~/composables/aruna_api_json";
import {useForm} from "vee-validate";
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'

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
const emit = defineEmits<{
  'add-author': [relation: v2Author]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
  firstName: z.string({required_error: "First name is required."}).min(2).max(128),
  lastName: z.string({required_error: "Last name is required."}).min(2).max(128),
  email: z.string().email('Invalid email format.').optional(),
  orcid: z.string().regex(ORCID_REGEX, 'Not a valid ORCID').optional(),
  userId: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
}))

const form = useForm({
  validationSchema: formSchema,
})

const onSubmit = form.handleSubmit(async (values) => {
  emit('add-author', {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email || '',
    orcid: values.orcid || '',
    id: values.userId || ''
  })})
/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Add Author
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-800 font-bold">Add Author</DialogTitle>
        <DialogDescription class="text-center">
          Add an additional author to the resource.
        </DialogDescription>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <div class="flex flex-col space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
          <div class="flex grow flex-col">
            <FormField v-slot="{ componentField }" name="firstName">
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Author's first name" v-bind="componentField" class="mt-0"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
          <div class="flex grow flex-col">
            <FormField v-slot="{ componentField }" name="lastName">
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="Author's last name" v-bind="componentField"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
        </div>

        <FormField v-slot="{ componentField }" name="email">
          <FormItem>
            <div class="flex items-center justify-between">
              <FormLabel>Email</FormLabel>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  A valid email address that can be used to contact the author.
                </PopoverContent>
              </Popover>
            </div>
            <FormControl>
              <Input type="text" placeholder="A valid email address" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="orcid">
          <FormItem>
            <FormLabel class="flex items-center justify-between">
              <span>ORCID</span>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  If available, you can enter the ORCID of the author here.
                </PopoverContent>
              </Popover>
            </FormLabel>
            <FormControl>
              <Input type="text" placeholder="Author's ORCID" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="userId">
          <FormItem>
            <FormLabel class="flex items-center justify-between">
              <span>User Id</span>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-800 font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  If available, you can enter the Aruna user id of the author here.
                </PopoverContent>
              </Popover>
            </FormLabel>
            <FormControl>
              <Input type="text" placeholder="Author's user id in Aruna" v-bind="componentField"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
      </form>

      <DialogFooter>
        <Button type="submit" form="dialogForm" class="bg-aruna-800 hover:bg-aruna-700">
          Add Author
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>