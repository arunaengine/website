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
import {type v2KeyValue, v2KeyValueVariant} from '~/composables/aruna_api_json'
import {useForm} from 'vee-validate'
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'
import {Checkbox} from "~/components/ui/checkbox";

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean
  withButton: boolean
  buttonLabel?: string
  buttonCss?: string
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => (open.value = externalTrigger.value))
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits<{
  'add-key-value': [keyValue: KeyValue]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(
    z.object({
      key: z.string({required_error: 'Key cannot be empty.'}).min(1, 'Key cannot be empty.').max(256),
      value: z.string().optional(),
      locked: z.boolean().optional(),
    })
)

const {handleSubmit, values} = useForm({
  validationSchema: formSchema,
  initialValues: {
    locked: false
  }
})

const onSubmit = handleSubmit(async values => {
  emit('add-key-value', {
    key: values.key,
    value: values.value || '',
    locked: values.locked || false
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
        {{ buttonLabel || 'Add Key-Value' }}
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md" @pointer-down-outside="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-highlight font-bold">Add Key-Value</DialogTitle>
        <DialogDescription class="text-aruna-text text-center">
          Add an individual key-value to your resource.
        </DialogDescription>
      </DialogHeader>

      <form id="keyValueForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{componentField}" name="key">
          <FormItem>
            <FormLabel>Key</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Here you can enter the key" v-bind="componentField" class="mt-0"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="value">
          <FormItem>
            <FormLabel>Value</FormLabel>
            <FormControl>
              <Textarea v-bind="componentField" :rows="5" placeholder="Here you can enter the value"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField type="checkbox" v-slot="{ value, handleChange }" name="locked">
          <FormItem class="flex flex-row items-start gap-x-3 space-y-0">
            <FormControl>
              <Checkbox :checked="value" @update:checked="handleChange"/>
            </FormControl>
            <div class="space-y-1 leading-none">
              <FormLabel>
                This label is locked/immutable
              </FormLabel>
              <FormMessage/>
            </div>
          </FormItem>
        </FormField>
      </form>
      <DialogFooter>
        <Button type="submit" form="keyValueForm"
                class="w-fit bg-transparent border border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
          Add key-value
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
