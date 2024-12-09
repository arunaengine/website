<script setup lang="ts">
import {ref} from 'vue'
import {IconCaretUpDown, IconCheck, IconCirclePlus} from "@tabler/icons-vue";
import {cn} from '@/utils/shadcn'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import {FormControl, FormField, FormItem, FormLabel, FormMessage} from "~/components/ui/form";
import {Input} from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {useToast} from '@/components/ui/toast/use-toast'

import type {Realm} from "~/composables/api_wrapper";
import {toTypedSchema} from "@vee-validate/zod";
import {z} from "zod";
import {useForm} from "vee-validate";

const {toast} = useToast()

/* ----- PROPERTIES ----- */
interface RealmSwitcherProps {
  realms: Realm[] | null
}
const props = defineProps<RealmSwitcherProps>()
console.log('[RealmSwitcher] Realms props type:', typeof props.realms)
/* ----- END PROPERTIES ----- */
const realms = toRef(() => props.realms)
watch(realms, () => {
  console.log('[RealmSwitcher] Updated realms:', realms.value)
  if (realms.value && realms.value.length > 0 && selectedRealm.value.tag === 'placeholder')
    selectedRealm.value = realms.value[0]
})

const realmsData = reactive({
  label: 'Your Realms',
  realms: realms
})
watch(realmsData, () => console.log('[RealmSwitcher] Updated realms data:', realmsData.realms ? realmsData.realms.length : 'null'))

const open = ref(false)
const showNewRealmDialog = ref(false)
const selectedRealm = ref<Realm>(realms.value && realms.value.length > 0 ? realmsData.realms[0] : {
  id: '',
  name: 'Not a member of any realm',
  tag: 'placeholder',
  description: ''
})

function emitRealmSwitch() {
  console.log('[RealmSwitcher]', `Emitted realm switch to: ${selectedRealm.value.name}`)
  EventBus.emit('switchRealm', selectedRealm.value.name)
}

function addRealm(realm: Realm) {
  console.log('[RealmSwitcher]', `Emitted realm add: ${realm.name}`)
  realmsData.realms ? realmsData.realms.push(realm) : realmsData.realms = [realm]

  if (selectedRealm.value.tag === 'placeholder')
    selectedRealm.value = realm
}

/* ----- FORM SCHEMA ----- */
const formSchema = toTypedSchema(
    z.object({
      name: z.string({required_error: 'Name is required.'}).min(5).max(256),
      tag: z.string({required_error: 'Tag is required.'}).min(1).max(25),
      description: z.string().optional(),
    })
)
const form = useForm({
  validationSchema: formSchema,
})
const onSubmit = form.handleSubmit(async values => {
  await $fetch('/api/v3/realm', {
    method: 'POST',
    body: {
      name: values.name,
      tag: values.tag,
      description: values.description
    }
  }).then(response => {
    if (response.realm) {
      addRealm(response.realm)
      toast({
        title: 'Info',
        description: `Realm creation succeeded. Switched realm to: ${response.realm.name}`
      })
    } else {
      toast({
        title: 'Error',
        description: 'Realm creation response is empty. This should not be possible :/',
        variant: 'destructive',
        duration: 10000,
      })
    }
  }).catch(error => {
    console.error('[Realm Switcher]', error)
    toast({
      title: 'Error',
      description: 'Realm creation failed. Please try again later.',
      variant: 'destructive',
      duration: 10000,
    })
  })
})
/* ----- END FORM SCHEMA ----- */
</script>

<template>
  <Dialog v-model:open="showNewRealmDialog">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
            variant="outline"
            role="combobox"
            aria-expanded="open"
            aria-label="Select a team"
            :class="cn('w-[300px] justify-between hover:bg-[#1F375E]', $attrs.class ?? '')">
          <!--
          <Avatar class="mr-2 h-5 w-5">
            <AvatarImage
                :src="selectedRealm.logo || '/imgs/aruna_icon.webp'"
                :alt="selectedRealm.name"/>
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          -->
          <Avatar class="mr-2 h-5 w-5">
            <AvatarImage
                src="/imgs/aruna_icon.webp"
                :alt="selectedRealm.name"/>
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          {{ selectedRealm.name }}
          <IconCaretUpDown class="ml-auto h-4 w-4 shrink-0 opacity-50"/>
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-[300px] p-1">
        <Command :filter-function="(list, term) => list.filter(i => i.name?.toLowerCase()?.includes(term)) ">
          <CommandList>
            <CommandInput placeholder="Search realm..." class="my-1 focus:ring-aruna-800 focus:border-0"/>
            <CommandEmpty>No realm found.</CommandEmpty>
            <CommandGroup :key="realmsData.label" :heading="realmsData.label">
              <CommandItem v-for="realm in realmsData.realms"
                           :key="realm.tag"
                           :value="realm"
                           class="text-sm"
                           @select="() => {
                             selectedRealm = realm
                             open = false
                             emitRealmSwitch()
                           }">
                <!--
                <Avatar class="mr-2 h-5 w-5">
                  <AvatarImage
                      :src="realm.logo || '/imgs/aruna_icon.webp'"
                      :alt="realm.label"/>
                  <AvatarFallback>SC</AvatarFallback>
                </Avatar>
                -->
                <Avatar class="mr-2 h-5 w-5">
                  <AvatarImage
                      src="/imgs/aruna_icon.webp"
                      :alt="selectedRealm.name"/>
                  <AvatarFallback>SC</AvatarFallback>
                </Avatar>
                {{ realm.name }}
                <IconCheck
                    :class="cn('ml-auto h-4 w-4',
                             selectedRealm.tag === realm.tag
                               ? 'opacity-100'
                               : 'opacity-0',
                  )"/>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <CommandSeparator/>
          <CommandList>
            <CommandGroup>
              <DialogTrigger as-child>
                <CommandItem value="create-realm"
                             @select="() => {
                               open = false
                               showNewRealmDialog = true
                             }">
                  <IconCirclePlus class="mr-2 h-5 w-5"/>
                  Create Realm
                </CommandItem>
              </DialogTrigger>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create Realm</DialogTitle>
        <DialogDescription>
          Add a new realm to manage your data products and data endpoints.
        </DialogDescription>
        <Separator class="my-4 bg-aruna-text/50"/>
      </DialogHeader>

      <form id="dialogForm" @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{componentField}" name="name">
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input type="text"
                     placeholder="A name for your realm"
                     v-bind="componentField"
                     class="mt-0" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="tag">
          <FormItem>
            <FormLabel>Tag</FormLabel>
            <FormControl>
              <Input type="text"
                     placeholder="A short tag for your realm"
                     v-bind="componentField"
                     class="mt-0" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{componentField}" name="description">
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea v-bind="componentField"
                        :rows="5"
                        placeholder="A concise description of your realm." />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>
      </form>

      <!--
      <div>
        <div class="space-y-4 pb-4">
          <div class="space-y-2">
            <Label for="name">Realm name</Label>
            <Input id="name" placeholder="A name for your realm"/>
          </div>
          <div class="space-y-2">
            <Label for="plan">Subscription plan</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">
                  <span class="font-medium">Free</span> -
                  <span class="text-muted-foreground">
                    Trial for two weeks
                  </span>
                </SelectItem>
                <SelectItem value="pro">
                  <span class="font-medium">Pro</span> -
                  <span class="text-muted-foreground">
                    $90/month per user
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      -->

      <DialogFooter>
        <Button variant="outline"
                class="text-aruna-text border border-aruna-text"
                @click="showNewRealmDialog = false">
          Cancel
        </Button>
        <Button type="submit"
                form="dialogForm"
                class="bg-transparent text-aruna-highlight border border-aruna-highlight hover:bg-aruna-highlight hover:text-white">
          Continue
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>