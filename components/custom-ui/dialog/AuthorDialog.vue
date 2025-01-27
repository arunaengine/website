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
import {useForm} from "vee-validate";
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean,
  buttonLabel?: string
  buttonCss?: string
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => open.value = externalTrigger.value)
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits<{
  'add-author': [relation: Author]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
  firstName: z.string({required_error: "First name is required."}).min(2).max(128),
  lastName: z.string({required_error: "Last name is required."}).min(2).max(128),
  email: z.string().email('Invalid email format.').optional(),
  identifier: z.string().optional(), //z.string().regex(ORCID_REGEX, 'Not a valid ORCID').optional(),
  userId: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
}))

const form = useForm({
  validationSchema: formSchema,
})

const onSubmit = form.handleSubmit(async (values) => {
  console.info('[AuthorDialog] Submit values:', values)
  emit('add-author', {
    id: values.userId || '',
    first_name: values.firstName,
    last_name: values.lastName,
    email: values.email || '',
    identifier: values.identifier || ''
  })
  open.value = false
})
/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline"
              :class="cn('rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent', props.buttonCss)">
        {{ buttonLabel || 'Add Author' }}
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-highlight font-bold">Add Author</DialogTitle>
        <DialogDescription class="text-aruna-text text-center">
          Add an additional author to the resource.
        </DialogDescription>
      </DialogHeader>

      <form id="authorForm" @submit="onSubmit" class="space-y-4">
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
                  <IconHelp class="size-4 text-aruna-highlight font-bold"/>
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
              <span>Identifier</span>
              <Popover>
                <PopoverTrigger>
                  <IconHelp class="size-4 text-aruna-highlight font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  If available, you can enter an external identifier of the author here.
                </PopoverContent>
              </Popover>
            </FormLabel>
            <FormControl>
              <Input type="text" placeholder="Other identifiers of the Author, e.g. ORCID" v-bind="componentField"/>
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
                  <IconHelp class="size-4 text-aruna-highlight font-bold"/>
                </PopoverTrigger>
                <PopoverContent class="text-sm rounded-sm">
                  If available, you can enter the author's Aruna user id here to automagically fill the fields.
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
        <Button type="submit"
                form="authorForm"
                class="w-fit bg-transparent border border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
          Add Author
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>