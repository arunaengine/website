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
import {FormControl, FormField, FormItem, FormLabel, FormMessage,} from '@/components/ui/form'
import {Input} from '@/components/ui/input'
import {type v2KeyValue, v2KeyValueVariant} from "~/composables/aruna_api_json";
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
  'add-key-value': [keyValue: v2KeyValue]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(z.object({
  key: z.string({required_error: "Key is required."}).min(2).max(256),
  value: z.string().optional(),
  variant: z.nativeEnum(v2KeyValueVariant) //.default(v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL),
}))

const form = useForm({
  validationSchema: formSchema,
})

const onSubmit = form.handleSubmit(async (values) => {
  emit('add-key-value', {
    key: values.key,
    value: values.value,
    variant: values.variant
  })
})
/* ----- END FORM SCHEMA ----- */
const validVariants = computed(() => Object.keys(v2KeyValueVariant).filter(variant => variant !== 'KEY_VALUE_VARIANT_UNSPECIFIED'))

function formatKeyValueLabel(variant: string): string {
  const label = variant.replace('KEY_VALUE_VARIANT_', '').replace('_', ' ').toLowerCase()
  return label.charAt(0).toUpperCase() + label.slice(1)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline">
        Add Key-Value
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md"
                   @pointer-down-outside="(event) => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-700 font-bold">Add Key-Value</DialogTitle>
        <DialogDescription class="text-center">
          Add an individual key-value to your resource.
        </DialogDescription>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{ componentField }" name="variant">
          <FormItem>
            <FormLabel>Variant</FormLabel>
            <Select v-bind="componentField">
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a key-value variant"/>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectGroup>
                  <SelectItem class="" v-for="variant in validVariants" :value="variant">
                    {{ formatKeyValueLabel(variant) }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="key">
          <FormItem>
            <FormLabel>Key</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Here you can enter the key" v-bind="componentField" class="mt-0"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="value">
          <FormItem>
            <FormLabel>Value</FormLabel>
            <FormControl>
              <Textarea v-bind="componentField"
                        :rows="5"
                        placeholder="Here you can enter the value"/>
            </FormControl>
            <FormMessage/>
          </FormItem>
        </FormField>
      </form>
      <DialogFooter>
        <Button type="submit" form="dialogForm" class="bg-aruna-800 hover:bg-aruna-700">
          Add key-value
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>