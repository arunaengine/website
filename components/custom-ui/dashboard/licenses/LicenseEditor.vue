<script setup lang="ts">
import {IconHelp} from '@tabler/icons-vue'
import {useForm} from "vee-validate";
import {toTypedSchema} from '@vee-validate/zod'
import * as z from 'zod'
import {useToast} from "~/components/ui/toast";
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {Button} from "~/components/ui/button";

/* ----- EMITS ----- */
const emit = defineEmits(['closeEditor'])
/* ----- END EMITS ----- */

// ----- FORM SCHEMA ---------- //
const formSchema = toTypedSchema(z.object({
  name: z.string({required_error: "Name is required."}).min(2).max(128),
  description: z.string().max(1024, "Description can only be 1024 characters long."),
  license_terms: z.string({required_error: "License terms are required."}).min(2)
}))

const form = useForm({
  validationSchema: formSchema,
})

const {toast} = useToast()
const onSubmit = form.handleSubmit(async (values) => {
  // Create License
  await $fetch<CreateLicensesResponse>('/api/v3/licenses', {
    method: 'POST',
    body: values
  }).then(response => {
    toast({
      title: 'Success',
      description: `License successfully created: ${response.license_id}`,
    })

    EventBus.emit('updateLicenses');
  })
})
// ----- END FORM SCHEMA ---------- //
</script>
<template>
  <div class="p-4 flex flex-col gap-y-4">
    <form id="licenseForm"
          @submit="onSubmit"
          class="space-y-4">
      <div class="flex flex-col space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
        <div class="flex grow flex-col">
          <FormField v-slot="{ componentField }" name="name">
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Name of the License" v-bind="componentField" class="mt-0 max-w-[50%]"/>
              </FormControl>
              <FormMessage/>
            </FormItem>
          </FormField>
        </div>
      </div>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <div class="flex items-center gap-x-4">
            <FormLabel>Description</FormLabel>
            <Popover>
              <PopoverTrigger>
                <IconHelp class="size-4 text-aruna-highlight font-bold"/>
              </PopoverTrigger>
              <PopoverContent class="text-sm rounded-sm">
                A concise description that, at best, explains the core of the licence in one sentence.
              </PopoverContent>
            </Popover>
          </div>
          <FormControl>
            <Input type="text"
                   placeholder="A concise description of your license."
                   v-bind="componentField"
                   class="mt-0"/>
          </FormControl>
          <FormMessage/>
        </FormItem>
      </FormField>

      <FormField v-slot="{componentField}" name="license_terms">
        <FormItem>
          <div class="flex items-center gap-x-4">
            <FormLabel>License Terms</FormLabel>
            <Popover>
              <PopoverTrigger>
                <IconHelp class="size-4 text-aruna-highlight font-bold"/>
              </PopoverTrigger>
              <PopoverContent class="text-sm rounded-sm">
                Here you can enter the full text of your license.
                <a href="https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt"
                   target="_blank"
                   class="text-aruna-highlight hover:cursor-pointer hover:text-aruna-highlight/80">Example</a>
              </PopoverContent>
            </Popover>
          </div>
          <FormControl>
            <Textarea v-bind="componentField"
                      :rows="25"
                      placeholder="Here you can enter the full text of your license." class="h-full"/>
          </FormControl>
          <FormMessage/>
        </FormItem>
      </FormField>
    </form>

    <div class="flex gap-x-4">
      <Button type="submit"
              form="licenseForm"
              class="w-fit bg-transparent border border-aruna-highlight text-aruna-highlight hover:bg-aruna-highlight hover:text-aruna-text-accent">
        Create License
      </Button>
      <Button variant="outline"
              class="w-fit bg-transparent border border-aruna-text text-aruna-text hover:border-aruna-text-accent hover:text-aruna-text-accent"
              @click="emit('closeEditor')">
        Cancel
      </Button>
    </div>
  </div>
</template>