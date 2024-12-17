import EventBus from "~/composables/EventBus";
import type {ResourceElement, SearchResponse} from "~/composables/api_wrapper";
import {GenericNodeType} from "~/types/aruna-v3-enums";

// by convention, composable function names start with "use"
export async function useProjects() {
  // state encapsulated and managed by the composable
  const projects: Ref<ResourceElement[] | null> = ref(null)
  const {refresh: refreshProjects} = await useFetch<SearchResponse>('/api/v3/search', {
    server: false,
    lazy: true,
    query: {
      filter: 'variant=0' // Projects
    },
    onResponse({response}) {
      if (response) {
        let resources: ResourceElement[] = []
        for (const resource of response._data.resources) {
          if (resource.type === GenericNodeType.Resource) {
            let extended = resource as any // lol, cast to any to allow dynamic adding of properties
            extended.children = []
            resources.push(extended as ResourceElement)
          }
        }
        projects.value = resources
      }
    }
  })

  // a composable can update its managed state over time.
  EventBus.on('updateProjects', async () => {
    console.log('Triggered projects update')
    await refreshProjects()
  })

  // expose managed state (and refresh alternative) as return value
  return {projects, refreshProjects}
}