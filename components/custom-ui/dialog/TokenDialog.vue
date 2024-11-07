<script setup lang="ts">
import {IconCalendar} from "@tabler/icons-vue"
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
import {type v2Permission, v2PermissionLevel,} from "~/composables/aruna_api_json";
import {useForm} from "vee-validate";
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'

import {useToast} from "~/components/ui/toast";

import {toDate} from 'radix-vue/date'
import {DateFormatter, getLocalTimeZone, parseDate, today} from '@internationalized/date'

const {toast} = useToast();

/* ----- CUSTOM ENUMS ----- */
enum Scopes {
  Personal = 'Personal',
  Project = 'Project',
  Collection = 'Collection',
  Dataset = 'Dataset',
  Object = 'Object'
}
/* ----- END CUSTOM ENUMS ----- */

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean,
  withButton: boolean
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => open.value = externalTrigger.value)
/* ----- END PROPERTIES ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
  tokenName: z.string({required_error: "Some token name is required."}).trim().min(2).max(256),
  tokenScope: z.nativeEnum(Scopes).default(Scopes.Personal),
  expiryDate: z.string().date('Invalid expiry date format.'),
  resourceId: z.string().regex(ULID_REGEX, 'Not a valid ULID').optional(),
  permissionLevel: z.nativeEnum(v2PermissionLevel).optional(),
}).superRefine((values, ctx) => {
  if (values.tokenScope !== Scopes.Personal && !values.resourceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Required',
      path: ['resourceId'],
    })
  }
  if (values.tokenScope !== Scopes.Personal && !values.permissionLevel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Required',
      path: ['permissionLevel'],
    })
  }
  return ctx
}))


const {handleSubmit, values, setFieldValue} = useForm({
  validationSchema: formSchema,
  initialValues: {
    tokenScope: Scopes.Personal,
    expiryDate: today(getLocalTimeZone()).add({days: 1}).toString()
  },
  keepValuesOnUnmount: true,
})

const onSubmit = handleSubmit(async (values) => {
  // Prepare request values
  const expiry = new Date(values.expiryDate)
  const perm = values.tokenScope === Scopes.Personal ? undefined : {
    projectId: values.tokenScope === Scopes.Project ? values.resourceId : undefined,
    collectionId: values.tokenScope === Scopes.Collection ? values.resourceId  : undefined,
    datasetId: values.tokenScope === Scopes.Dataset ? values.resourceId  : undefined,
    objectId: values.tokenScope === Scopes.Object ? values.resourceId  : undefined,
    permissionLevel: values.permissionLevel
  } as v2Permission

  // Send request to create token
  await createUserToken(values.tokenName, perm, expiry.toISOString())
      .then(response => {
        if (response?.tokenSecret) {
          tokenSecret.value = response.tokenSecret
          EventBus.emit('updateUser')
        } else {
          // Notify with error
          toast({
            title: 'Error',
            //description: 'Something went wrong. If this problem persists please contact an administrator.',
            description: 'Token secret in response was empty. Please try again later.',
            variant: 'destructive',
            duration: 10000,
          })
        }
      }).catch(error => {
        // Notify with error
        toast({
          title: 'Error',
          //description: 'Something went wrong. If this problem persists please contact an administrator.',
          description: error.message, // 'Token creation failed. Please try again later.',
          variant: 'destructive',
          duration: 10000,
        })
      })
})
/* ----- END FORM SCHEMA ----- */

const validPermissionLevels = computed(() => Object.keys(v2PermissionLevel).filter(variant => variant !== 'PERMISSION_LEVEL_UNSPECIFIED'))

function formatPermissionLevel(variant: string): string {
  const label = variant.replace('PERMISSION_LEVEL_', '').replace('_', ' ').toLowerCase()
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const tokenSecret: Ref<string | undefined> = ref(undefined)

const calendarValue = computed({
  get: () => values.expiryDate ? parseDate(values.expiryDate) : undefined,
  set: val => val,
})

const df = new DateFormatter((navigator && navigator.language) || "de-DE", {
  dateStyle: 'long',
})

function clear(visibility: boolean) {
  console.log(`Changed open state: ${visibility}`)
  if (!visibility) {
    tokenSecret.value = undefined
    setFieldValue('tokenName', undefined)
    setFieldValue('tokenScope', Scopes.Personal)
    setFieldValue('expiryDate', today(getLocalTimeZone()).add({days: 1}).toString())
  }
}
</script>

<template>
  <Dialog v-model:open="open" @update:open="clear">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Create Token
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-xl sm:rounded-md border-aruna-text/50"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-highlight font-bold">Create Token</DialogTitle>
        <DialogDescription class="text-center text-aruna-text">
          Create an individual Aruna access token
        </DialogDescription>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{ componentField }" name="tokenName">
          <FormItem>
            <FormLabel>Token Name</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Some speaking name for the token" v-bind="componentField"
                     class="mt-0"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <div class="flex flex-col space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
          <div class="flex grow flex-col basis-1/2">
            <FormField v-slot="{ componentField }" name="tokenScope">
              <FormItem>
                <FormLabel>Scope</FormLabel>
                <Select v-bind="componentField"
                        :default-value="Scopes.Personal"
                        @update:model-value="(v) => {
                          if (v === Scopes.Personal) {
                            setFieldValue('resourceId', undefined)
                            setFieldValue('permissionLevel', undefined)
                          }}">
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a key-value variant"/>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem class="" v-for="scope in Scopes" :value="scope">
                        {{ scope }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
          <div class="flex grow flex-col basis-1/2">
            <FormField name="expiryDate">
              <FormItem class="space-y-2">
                <FormLabel>Token expiry date</FormLabel>
                <Popover>
                  <PopoverTrigger as-child>
                    <FormControl>
                      <Button variant="outline"
                              :class="cn('flex w-full ps-3 text-start font-normal', !calendarValue && 'text-muted-foreground',)">
                        <span>{{ calendarValue ? df.format(toDate(calendarValue)) : "Pick a date" }}</span>
                        <IconCalendar class="ms-auto h-4 w-4 opacity-50"/>
                      </Button>
                      <input hidden>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0">
                    <Calendar
                        v-model="calendarValue"
                        calendar-label="Date of birth"
                        initial-focus
                        :default-value="today(getLocalTimeZone()).add({days: 1})"
                        :min-value="today(getLocalTimeZone()).add({days: 1})"
                        @update:model-value="(v) => {
                          if (v) {
                            setFieldValue('expiryDate', v.toString())
                          } else {
                            setFieldValue('expiryDate', undefined)
                          }
                        }"/>
                  </PopoverContent>
                </Popover>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
        </div>

        <div class="flex flex-col space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
          <div class="flex grow flex-col">
            <FormField v-slot="{ componentField }" name="resourceId">
              <FormItem v-if="values.tokenScope !== Scopes.Personal">
                <FormLabel>Resource Id</FormLabel>
                <FormControl>
                  <Input type="text" placeholder="A valid resource id" v-bind="componentField"/>
                </FormControl>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
          <div class="flex grow flex-col">
            <FormField v-slot="{ componentField }" name="permissionLevel">
              <FormItem v-if="values.tokenScope !== Scopes.Personal">
                <FormLabel>Permission Level</FormLabel>
                <Select v-bind="componentField">
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a permission level"/>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem class="" v-for="level in validPermissionLevels" :value="level">
                        {{ formatPermissionLevel(level) }}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage/>
              </FormItem>
            </FormField>
          </div>
        </div>

        <!-- Token Secret -->

        <div v-if="tokenSecret"
             class="flex flex-col text-center bg-neutral-900 border border-gray-700 shadow-sm rounded-sm p-4 md:p-5">
          <h3 class="text-lg font-bold text-gray-200">
            Token Secret
          </h3>
          <p class="mt-1 text-xs font-medium uppercase text-orange-500">
            This token secret can not be regenerated.
          </p>
          <p class="mt-1 text-xs font-medium uppercase text-orange-500">
            Store it in a secure location before you close this window.
          </p>
          <hr class="my-4"/>
          <p class="mt-2 text-wrap break-all text-neutral-400">
            {{ tokenSecret }}
          </p>
        </div>
        <!-- End Token Secret -->

      </form>

      <DialogFooter>
        <Button type="submit"
                form="dialogForm"
                variant="outline"
                class="border border-aruna-highlight bg-transparent text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent rounded-sm"
                :disabled="tokenSecret">
          Create Token
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>