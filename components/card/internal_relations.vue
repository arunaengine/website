<script setup lang="ts">
import {
  IconArrowBigLeftLines,
  IconArrowBigRightLines,
  IconFile,
  IconFolder,
  IconFolders,
  IconLink
} from '@tabler/icons-vue';
import {
  type v2ExternalRelation,
  v2ExternalRelationVariant,
  type v2InternalRelation,
  v2InternalRelationVariant,
  type v2Relation,
  v2RelationDirection,
  v2ResourceVariant,
  type v2ResourceWithPermission
} from '~/composables/aruna_api_json';

const props = defineProps<{
  relations: v2InternalRelation[] | undefined
}>()
const relations = toRef(() => props.relations)

// ----- Relation Pagination ----------
const page = ref<number>(1)
const pageSize = ref(10)
const displayedResources = ref<[ObjectInfo, v2InternalRelation][]>(await loadResourcesPage())
watch(pageSize, async () => {
  console.info('[RelationsCard] Changed page size to:', pageSize.value)
  page.value = 1
  displayedResources.value = await loadResourcesPage()
})
watch(page, async () => {
  console.info('[RelationsCard] Changed incoming relations page to:', page.value)
  displayedResources.value = await loadResourcesPage()
})

async function loadResourcesPage(): Promise<[ObjectInfo, v2InternalRelation][]> {
  if (relations.value) {
    const start = (page.value - 1) * pageSize.value
    const end = page.value * pageSize.value
    const relationsSlice = relations.value.slice(start, end)

    const resourceIds: string[] = relationsSlice.map(rel => rel.resourceId).filter(id => id !== undefined)
    const relInfo = new Map(relationsSlice.map(rel => [rel.resourceId, rel]))

    // Fetch resources associated with the relations in range
    return await $fetch<v2ResourceWithPermission[]>('/api/resources', {
      query: {
        resourceIds: resourceIds
      }
    }).then(resources => {
      return resources.filter(res => res.resource !== undefined).map(resource => {
        const info_object = toObjectInfo(resource.resource, undefined)
        if (info_object)
          return [info_object, relInfo.get(info_object.id)]
        else
          return []
      })
    }).catch(error => {
      console.error('[RelationsCard] Children resource fetch error:', error)
      return []
    })
  }
  return []
}
// ----- End Relation Pagination ----------
</script>

<template>
  <div v-if="relations && relations.length > 10"
       class="flex gap-6 p-4">
    <!-- Page Size Selection -->
    <Select @update:modelValue="(v) => pageSize = parseInt(v)"
            :default-value="pageSize.toString()">
      <SelectTrigger class="w-[180px] rounded-none border-aruna-text/50">
        <SelectValue>Page size: {{ pageSize }}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Page Size</SelectLabel>
          <SelectItem v-for="size in ['1','5','10','15','25','50','100']" :value="size">{{ size }}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <!-- End Page Size Selection -->
    <!-- Relation Pagination -->
    <Pagination v-model:page="page"
                v-slot="{ page }"
                :total="relations.length"
                :items-per-page="pageSize"
                :default-page="1"
                :sibling-count="1"
                show-edges>
      <PaginationList v-slot="{ items }" class="flex items-center gap-1">
        <PaginationFirst class="border-aruna-highlight"/>
        <PaginationPrev class="border-aruna-highlight"/>

        <template v-for="(item, index) in items">
          <PaginationListItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
            <Button class="w-9 h-9 p-0 border border-aruna-highlight"
                    :class="{'bg-aruna-fg text-aruna-text-accent hover:bg-aruna-bg': item.value === page}"
                    :variant="item.value === page ? 'default' : 'outline'">
              {{ item.value }}
            </Button>
          </PaginationListItem>
          <PaginationEllipsis v-else :key="item.type" :index="index"/>
        </template>

        <PaginationNext class="border-aruna-highlight"/>
        <PaginationLast class="border-aruna-highlight"/>
      </PaginationList>
    </Pagination>
    <!-- End Relation Pagination -->
  </div>

  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-aruna-text/50">
          <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Name
            </th>
            <!--
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              ID
            </th>
            -->
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Resource
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Type
            </th>
          </tr>
          </thead>
          <tbody class="divide-y divide-aruna-text/50">
          <tr v-for="[resource, relInfo] in displayedResources" :key="resource.id">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <NuxtLink :to="`/objects/${resource.id}`"
                        exact=true
                        class="text-aruna-highlight hover:text-aruna-highlight/80">
                <div class="max-w-[500px] truncate overflow-ellipsis">
                  <!--<IconArrowBigRightLines class="flex-shrink-0 size-6 inline-block"/>-->
                  <IconFolders v-if="resource.variant === v2ResourceVariant.RESOURCE_VARIANT_COLLECTION"
                               class="flex-shrink-0 size-6 inline-block me-2"/>
                  <IconFolder v-else-if="resource.variant === v2ResourceVariant.RESOURCE_VARIANT_DATASET"
                              class="flex-shrink-0 size-6 inline-block me-2"/>
                  <IconFile v-else-if="resource.variant === v2ResourceVariant.RESOURCE_VARIANT_OBJECT"
                            class="flex-shrink-0 size-6 inline-block me-2"/>

                  <!--{{ child.title ? child.title : child.name }}-->
                  {{ resource.name }}
                </div>
              </NuxtLink>
            </td>
            <!--
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ resource.id }}
            </td>
            -->
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ toResourceTypeStr(resource.variant) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <span v-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                          relInfo.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND">
                  Parent
              </span>
              <span v-else-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                               relInfo.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND">
                  Child
              </span>
              <span v-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN">
                  Origin
                </span>
              <span v-else-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION">
                  Version
                </span>
              <span
                  v-else-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA">
                  Metadata
                </span>
              <span
                  v-else-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY">
                  Policy
                </span>
              <span
                  v-else-if="relInfo.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM">
                  {{ relInfo.customVariant }}
                </span>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>