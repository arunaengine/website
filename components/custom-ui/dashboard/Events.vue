<script lang="ts" setup>
import {IconSearch} from '@tabler/icons-vue'
import {refDebounced} from '@vueuse/core'
import EventList from './EventList.vue'
import EventDisplay from './EventDisplay.vue'
import {Separator} from '@/components/ui/separator'
import {Input} from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {TooltipProvider} from '@/components/ui/tooltip'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@/components/ui/resizable'

interface EventsProps {
  events: BaseTx[]
  defaultLayout?: number[]
  defaultCollapsed?: boolean
  navCollapsedSize: number
}

const props = withDefaults(defineProps<EventsProps>(), {
  defaultCollapsed: false,
  defaultLayout: () => [440, 655],
})

const events = toRef(() => props.events)

watch(events, (newVal) => console.log('[EventsComponent]', newVal))

const isCollapsed = ref(props.defaultCollapsed)
const selectedEvent = ref<string | undefined>(events.value[0].id)
const searchValue = ref('')
const debouncedSearch = refDebounced(searchValue, 250)

const filteredMailList = computed(() => {
  let output: BaseTx[]
  const searchValue = debouncedSearch.value?.trim()
  if (!searchValue) {
    output = events.value
  } else {
    output = events.value.filter((item) => {
      return item.event_id.includes(debouncedSearch.value)
          || item.type.includes(debouncedSearch.value)
    })
  }

  console.log('[EventsComponent] Search Value:', searchValue)
  return output
})

const unreadEventsList = computed(() => filteredMailList.value.filter(item => true))
const selectedEventData = computed(() => props.events.find(item => item.id === selectedEvent.value))

function onCollapse() {
  isCollapsed.value = true
}

function onExpand() {
  isCollapsed.value = false
}
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <ResizablePanelGroup
        id="resize-panel-group-1"
        direction="horizontal"
        class="h-full max-h-[calc(100vh-225px)] items-stretch">
      <ResizablePanel id="resize-panel-1" :default-size="defaultLayout[0]" :min-size="30">
        <Tabs default-value="all">
          <div class="flex items-center px-4 py-2">
            <h1 class="text-xl font-bold">
              Inbox
            </h1>
            <TabsList class="ml-auto">
              <TabsTrigger value="all" class="text-zinc-600 dark:text-zinc-200">
                All mail
              </TabsTrigger>
              <TabsTrigger value="unread" class="text-zinc-600 dark:text-zinc-200">
                Unread
              </TabsTrigger>
            </TabsList>
          </div>
          <Separator/>
          <div class="p-4">
            <form>
              <div class="relative">
                <IconSearch class="absolute left-2 top-2.5 size-4 text-muted-foreground"/>
                <Input v-model="searchValue" placeholder="Search" class="pl-8 bg-muted"/>
              </div>
            </form>
          </div>
          <TabsContent value="all" class="m-0">
            <EventList v-model:selected-mail="selectedEvent" :items="filteredMailList"/>
          </TabsContent>
          <TabsContent value="unread" class="m-0">
            <EventList v-model:selected-mail="selectedEvent" :items="unreadEventsList"/>
          </TabsContent>
        </Tabs>
      </ResizablePanel>
      <ResizableHandle id="resiz-handle-1" with-handle/>
      <ResizablePanel id="resize-panel-2" :default-size="defaultLayout[1]">
        <EventDisplay :eventData="selectedEventData"/>
      </ResizablePanel>
    </ResizablePanelGroup>
  </TooltipProvider>
</template>