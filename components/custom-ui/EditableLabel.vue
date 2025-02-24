<script setup lang="ts">
import {IconCancel, IconCheck, IconDeviceFloppy, IconLoader3} from '@tabler/icons-vue'
import {Input} from "~/components/ui/input";
import {useToast} from '~/components/ui/toast/use-toast'

const {toast} = useToast()

// ----- v-model ---------- //
const editMode = defineModel<boolean>('edit-mode')
watch(editMode, (value, oldValue, onCleanup) => {
  if (!value && oldValue) {
    waiting.value = false
    editedText.value = text.value
  }
  onCleanup(() => {
    waiting.value = false
    editedText.value = text.value
  })
})

// ----- Properties ---------- //
interface EditableLabelProps {
  resourceId: string,
  text: string,
  multiline: boolean,
  textCss?: string,
}

const props = defineProps<EditableLabelProps>()
const resourceId = toRef(() => props.resourceId)
const text = toRef(() => props.text)
const editedText = ref<string>(text.value || '')
const waiting = ref(false)
// ----- End Properties ---------- //

const emit = defineEmits<{
  (e: 'updated-value', resourceId: string, value: string): void
}>();

async function emitSave() {
  waiting.value = true
  emit('updated-value', resourceId.value, editedText.value)
}

async function save() {
  const request = {
    id: props.resourceId,
    description: text.value
  } as UpdateResourceDescriptionRequest
  waiting.value = true

  await $fetch<UpdateResourceDescriptionResponse>('/api/v3/resources/description', {
    method: 'POST',
    body: request
  }).then(response => {
    console.info('[EditableLabel] Description update successful')
    toast({
      description: h('div',
          {class: 'flex space-x-2 items-center justify-center text-aruna-text-accent'},
          [
            h(IconCheck, {class: 'flex-shrink-0 size-6 text-aruna-highlight'}),
            h('span',
                {class: 'text-fuchsia-50'},
                ['Update successful.'])
          ]),
      duration: 5000
    })

    waiting.value = false
    editMode.value = false

  }).catch(error => {
    console.error('[EditableLabel] Update error', error.data)
    waiting.value = false
  })

}
</script>
<template>
  <div v-if="editMode"
       class="flex flex-col w-full items-center gap-1.5">
    <div class="w-full items-center">
      <!-- Textarea for multiline strings -->
      <div v-if="multiline"
           class="flex">
        <Textarea v-model="editedText"
                  :rows="5"
                  placeholder="Enter a description for your resource"
                  class="py-3 ps-4 pe-6 w-full border-aruna-text/50 rounded-s-md rounded-e-none bg-aruna-muted text-aruna-text-accent text-sm
                                   focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                                   focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                                   disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
        <div class="flex flex-col h-fit">
          <Button variant="outline"
                  @click="emitSave()"
                  :disabled="waiting"
                  class="rounded-none rounded-tr-sm border-aruna-text/50 px-2 h-auto bg-transparent text-aruna-highlight hover:bg-aruna-highlight/25 hover:text-aruna-highlight">
            <IconLoader3 v-if="waiting" class="text-aruna-highlight animate-spin"/>
            <IconDeviceFloppy v-else/>
          </Button>
          <Button variant="outline"
                  @click="editMode = false"
                  class="rounded-none rounded-br-sm border-aruna-text/50 px-2 h-auto bg-transparent text-destructive hover:bg-destructive/25 hover:text-destructive">
            <IconCancel/>
          </Button>
        </div>
      </div>
      <!-- End Textarea for multiline strings -->
      <!-- Input for single line strings -->
      <div v-else class="flex">
        <Input type="text"
               v-model="editedText"
               placeholder="Enter a description for your resource"
               class="py-2 px-3 h-auto w-full border-aruna-text/50 rounded-l-md rounded-e-none bg-aruna-muted text-aruna-text-accent text-sm
                    focus:border-aruna-highlight focus:ring-aruna-highlight focus:outline-none
                    focus-visible:border-aruna-highlight focus-visible:ring-aruna-highlight focus-visible:outline-none
                    disabled:opacity-50 disabled:pointer-events-none placeholder:text-aruna-text"/>
        <Button variant="outline"
                @click="emitSave()"
                :disabled="waiting"
                class="rounded-none border-aruna-text/50 px-2 h-auto bg-transparent text-aruna-highlight hover:bg-aruna-highlight/25 hover:text-aruna-highlight">
          <IconLoader3 v-if="waiting" class="text-aruna-highlight animate-spin"/>
          <IconDeviceFloppy v-else/>
        </Button>
        <Button variant="outline"
                @click="editMode = false"
                class="rounded-s-none border-aruna-text/50 px-2 h-auto bg-transparent text-destructive hover:bg-destructive/25 hover:text-destructive">
          <IconCancel/>
        </Button>
      </div>
      <!-- End Input for single line strings -->
    </div>
  </div>
  <!-- Text Display -->
  <span v-else :class="cn('text-aruna-text', props.textCss)">{{ text }}</span>
  <!-- End Text Display -->
</template>