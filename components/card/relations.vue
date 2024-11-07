<script setup lang="ts">
import {IconArrowBigLeftLines, IconArrowBigRightLines, IconLink} from '@tabler/icons-vue';
import {
  type v2ExternalRelation,
  v2ExternalRelationVariant,
  type v2InternalRelation,
  v2InternalRelationVariant,
  type v2Relation,
  v2RelationDirection
} from '~/composables/aruna_api_json';

const props = defineProps<{
  relations: v2Relation[] | undefined
  external: boolean
}>()
const [inc_int_rel, inc_out_rel, ext_rel] = splitRelations()

function splitRelations(): [v2InternalRelation[], v2InternalRelation[], v2ExternalRelation[]] {
  let inc_int: v2InternalRelation[] = []
  let inc_out: v2InternalRelation[] = []
  let ext: v2ExternalRelation[] = []

  props.relations?.forEach((relation) => {
    if (relation.external) {
      ext.push(relation.external)
    } else if (relation.internal) {
      // Exclude deleted resources from list
      if (relation.internal.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED)
        return

      // Split into incoming and outgoing relations
      if (relation.internal.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND) {
        inc_int.push(relation.internal)
      } else if (relation.internal.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND) {
        inc_out.push(relation.internal)
      }
    }
  })

  return [inc_int, inc_out, ext]
}
</script>

<template>
  <div class="-m-1.5 overflow-x-auto">
    <div class="p-1.5 min-w-full inline-block align-middle">
      <div class="overflow-hidden">
        <table class="min-w-full divide-y divide-aruna-text/50">
          <thead>
          <tr v-if="props.external">
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Identifier
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Type
            </th>
          </tr>
          <tr v-else>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              ID
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Resource
            </th>
            <th scope="col" class="px-6 py-3 text-start text-sm font-medium text-aruna-text-accent uppercase">
              Type
            </th>
          </tr>
          </thead>

          <thead v-if="!props.external && inc_int_rel.length > 0">
          <tr>
            <th colspan="3" class="px-6 py-3 text-start text-sm font-medium text-aruna-text uppercase">Incoming</th>
          </tr>
          </thead>

          <tbody v-if="props.external" class="divide-y divide-aruna-text/50">
          <tr v-for="relation in ext_rel" class="hover:bg-aruna-fg">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <a v-if="relation.definedVariant == v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_URL"
                 :href="`${relation.identifier}`" target="_blank" class="ms-1">
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
          <tbody v-else class="divide-y divide-aruna-text/50">
          <tr v-for="relation in inc_int_rel">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <NuxtLink :to="`/objects/${relation.resourceId}`"
                        exact=true
                        class="text-aruna-highlight hover:text-aruna-highlight/80">
                <div>
                  <IconArrowBigRightLines class="flex-shrink-0 size-6 inline-block"/>
                  {{ relation.resourceId }}
                </div>
              </NuxtLink>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ toResourceTypeStr(relation.resourceVariant) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
                <span v-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                            relation.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND">
                  Parent
                </span>
              <span v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                               relation.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND">
                  Child
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN">
                  Origin
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION">
                  Version
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA">
                  Metadata
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY">
                  Policy
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM">
                  {{ relation.customVariant }}
                </span>
            </td>
          </tr>
          </tbody>

          <thead v-if="!props.external && inc_out_rel.length > 0">
          <tr>
            <th colspan="3" class="px-6 py-3 text-start text-sm font-medium text-aruna-text uppercase">Outgoing</th>
          </tr>
          </thead>
          <tbody v-if="!props.external && inc_out_rel.length > 0" class="divide-y divide-aruna-text/50">
          <tr v-for="relation in inc_out_rel">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <NuxtLink :to="`/objects/${relation.resourceId}`" exact=true class="text-aruna-highlight hover:text-aruna-highlight/80">
                <div>
                  <IconArrowBigLeftLines class="flex-shrink-0 size-6 inline-block"/>
                  {{ relation.resourceId }}
                </div>
              </NuxtLink>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              {{ toResourceTypeStr(relation.resourceVariant) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-aruna-text">
              <span v-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                            relation.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND">
                  Parent
              </span>
              <span v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                               relation.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND">
                  Child
              </span>
              <span v-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN">
                  Origin
                </span>
              <span v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION">
                  Version
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA">
                  Metadata
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY">
                  Policy
                </span>
              <span
                  v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM">
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