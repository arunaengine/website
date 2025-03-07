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
  relations: v2ExternalRelation[] | undefined
}>()
const relations = toRef(() => props.relations)

// ----- Relation Pagination ----------
const page = ref<number>(1)
const pageSize = ref(10)
const displayedRelations = computed(() => {
  if (relations.value) {
    const start = (page.value - 1) * pageSize.value
    const end = page.value * pageSize.value
    return relations.value.slice(start, end)
  }
  return []
})
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
              Identifier
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Type
            </th>
          </tr>
          </thead>
          <tbody class="divide-y divide-aruna-text/50">
          <tr v-for="relation in displayedRelations" :key="relation.identifier">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <a v-if="relation.definedVariant == v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_URL"
                 :href="`${relation.identifier}`"
                 target="_blank"
                 class="ms-1">
                <IconLink class="flex-shrink-0 size-4 inline-block"/>
                {{ relation.identifier }}
              </a>
              <span v-else>
                {{ relation.identifier }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
                <span v-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_URL">
                  URL
                </span>
              <span
                  v-else-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_IDENTIFIER">
                  Identifier
                </span>
              <span
                  v-else-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_CUSTOM">
                  {{ relation.customVariant }}
                </span>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>