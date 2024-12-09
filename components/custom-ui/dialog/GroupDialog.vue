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
import {useForm} from 'vee-validate'
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'

/* ----- PROPERTIES ----- */
const props = defineProps<{
  initialOpen: boolean
  withButton: boolean
}>()
const externalTrigger = toRef(props, 'initialOpen')
const open = ref(props.initialOpen)
watch(externalTrigger, () => (open.value = externalTrigger.value))
/* ----- END PROPERTIES ----- */

/* ----- EVENT EMITS ----- */
const emit = defineEmits<{
  'add-group': [group: GroupInfo]
}>()
/* ----- END EVENT EMITS ----- */

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(
  z.object({
    name: z.string({required_error: 'Key is required.'}).min(2).max(256),
    description: z.string().optional(),
  })
)

const form = useForm({
  validationSchema: formSchema,
})

const onSubmit = form.handleSubmit(async values => {
  // Create group
  await $fetch<CreateGroupResponse>('/api/v3/group', {
    method: 'POST',
    body: {
      name: values.name,
      description: values.description
    }
  }).then(response => {
    if (response.group) {
      // Emit global groups re-fresh
      EventBus.emit('updateGroups')
      open.value = false

      // Emit add group to parent component
      /*
      emit('add-group', {
        id: '',
        name: values.name,
        description: values.description || ''
      })
      */
    } else {

    }
  })
})
/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger v-if="withButton" as-child>
      <Button variant="outline"
              class="w-fit rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent">
        Create Group
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px] sm:rounded-md" @pointer-down-outside="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle class="mb-2 text-center text-aruna-700 font-bold">Create Group</DialogTitle>
        <DialogDescription class="text-center"> Add an individual key-value to your resource. </DialogDescription>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{componentField}" name="name">
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input type="text" placeholder="Here you can enter the name of your group" v-bind="componentField" class="mt-0" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="description">
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea v-bind="componentField" :rows="5" placeholder="Here you can enter a brief description of your group" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>
      <DialogFooter>
        <Button type="submit"
                form="dialogForm"
                class="rounded-sm text-aruna-highlight border border-aruna-highlight bg-transparent hover:bg-aruna-highlight hover:text-aruna-text-accent">
          Create Group
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
