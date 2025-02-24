<script setup lang="ts">
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "@/components/ui/tooltip"

import {ResourceVariant, VisibilityClass} from "~/types/aruna-v3-enums";


/* ----- PROPERTIES ----- */
interface ResourceCardProps {
  resource: Resource
}

const {resource} = defineProps<ResourceCardProps>()

/* ----- END PROPERTIES ----- */

function displayDescription(description: string): string {
  if (description.length > 512) {
    return description.slice(0, 512) + " ..."
  }
  return description
}
function displayVisbility(visibility: VisibilityClass): string {
  switch (visibility) {
    case VisibilityClass.Public: return 'Public';
    case VisibilityClass.PublicMetadata: return 'Public Metadata';
    case VisibilityClass.Private: return 'Private';
    default: return 'Unspecified'
  }
}
function visibilityCss(visibility: VisibilityClass): string {
  switch (visibility) {
    case VisibilityClass.Public: return 'border-green-600 text-green-600';
    case VisibilityClass.PublicMetadata: return 'border-white text-white';
    case VisibilityClass.Private: return 'border-red-600/80 text-red-600/80';
    default: return 'border-aruna-text/50 text-aruna-text/50'
  }
}
</script>

<template>
  <div
       class="flex flex-auto my-3 p-4 gap-x-4 bg-aruna-bg/90 border border-l-4 border-l-aruna-highlight shadow-sm rounded-md border-aruna-text/50"
       :class="{'border-l-destructive': resource.deleted}">
    <div class="flex flex-col basis-1/3 gap-y-3 border-aruna-text/50">
      <!-- Name and ID display -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <NuxtLink :to="`/objects/${resource.id}`"
                      class="text-aruna-highlight font-bold">
              <h3>{{ resource.name }}</h3>
            </NuxtLink>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ resource.id }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <h4>{{ resource.type === "Resource" ? resource.variant : resource.type }}</h4>
      <!-- END Name and ID display -->

      <!-- Badges -->
      <div class="flex flex-col md:flex-row mt-2 gap-x-2 gap-y-2">
        <!-- DataClass Badge -->
        <Badge :class="cn('px-2 py-1 bg-transparent hover:bg-transparent border', visibilityCss(resource.data_class))">
          {{ displayVisbility(resource.visibility) }}
        </Badge>
        <!-- END DataClass -->
        <!-- Stats Badge -->
        <Badge v-if="resource.variant !== ResourceVariant.Object"
               class="px-2 py-1 bg-transparent hover:bg-transparent border border-aruna-text text-aruna-text">
          Children: {{ resource.count }}
        </Badge>
        <Badge v-if="resource.variant === ResourceVariant.Object"
              class="px-2 py-1 bg-transparent hover:bg-transparent border border-aruna-text text-aruna-text">
          {{ resource.content_len ? formatBytes(+resource.content_len) : "N/A Bytes" }}
        </Badge>
        <!-- END Stats Badge -->
      </div>
      <!-- END Badges -->
    </div>
    <div class="mx-2 grow flex-col basis-2/3">
      <h4 class="text-sm my-3 uppercase text-aruna-text-accent">Description</h4>
      <p v-if="resource.description.length > 0" class="mt-2 text-aruna-text">
        {{ displayDescription(resource.description) }}
      </p>

      <hr v-if="resource.labels.length > 0" class="my-4 text-aruna-text "/>

      <!-- Basic Label Display -->
      <div class="flex flex-row flex-wrap">
        <div v-for="label in resource.labels" class="flex flex-row my-1 me-2 last:me-0">
          <span
              :class="{ 'me-2 rounded-md': label.value === '' || label.value === undefined, 'rounded-l-md': label.value && label.value.length > 0 }"
              class="text-xs font-medium truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1.5 px-3 rounded-l-md text-aruna-highlight border border-aruna-highlight">
            {{ label.key }}
          </span>
          <span v-if="label.value"
                class="truncate max-w-60 whitespace-nowrap items-center gap-x-1.5 py-1.5 px-3 rounded-r-lg text-xs font-medium border border-l-0 border-aruna-highlight text-aruna-bg bg-aruna-highlight">
            {{ label.value }}</span>
        </div>
      </div>

    </div>
  </div>
</template>