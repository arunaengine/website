
<script setup lang="ts">
import { IconArrowBigLeftLines } from '@tabler/icons-vue';
import type { IconLink } from '@tabler/icons-vue';
import { IconArrowBigRightLines } from '@tabler/icons-vue';
import { IconExternalLink } from '@tabler/icons-vue';
import { v2ExternalRelationVariant, type v2ExternalRelation, type v2Relation, v2RelationDirection, v2InternalRelationVariant, type v2InternalRelation } from '~/composables/aruna_api_json';

const props = defineProps<{
    relations: v2Relation[] | undefined
    external: boolean
}>()
const [inc_int_rel, inc_out_rel, ext_rel] = splitRelations()

function splitRelations(): [v2InternalRelation[], v2InternalRelation[], v2ExternalRelation[]] {
    let inc_int: v2InternalRelation[] = []
    let inc_out: v2InternalRelation[] = []
    let ext: v2ExternalRelation[] = []

    props.relations?.forEach((dingens) => {
        if (dingens.external) {
            ext.push(dingens.external)
        } else if (dingens.internal) {
            if (dingens.internal.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND) {
                inc_int.push(dingens.internal)
            } else if (dingens.internal.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND) {
                inc_out.push(dingens.internal)
            }
        }
    })

    return [inc_int, inc_out, ext]
}
</script>

<template>
    <div class="col-xl-12 col-xxl-6">
        <div class="card card-body-scrollable card-body-scrollable-shadow">
            <div class="card-header m-0">
                <span class="text-secondary icon-lg me-2 mt-1">
                    <IconExternalLink :size="24" />
                </span>
                <h3 v-if="external" class="h2 text-secondary mb-0 align-items-top">External relations</h3>
                <h3 v-else class="h2 text-secondary mb-0 align-items-top">Internal relations</h3>
            </div>
            <div class="card-table table-responsive ">
                <table v-if="external" class="table table-vcenter text-start">
                    <thead>
                        <tr>
                            <th class="text-start">Identifier</th>
                            <th>TYPE</th>
                        </tr>
                    </thead>
                    <tbody v-if="props.relations && ext_rel.length > 0">
                        <tr v-for="relation in ext_rel">
                            <td class="text-start">
                                <A href="`${relation.external.identifier}`" exact=true class="ms-1">
                                    <IconLink />
                                    {{ relation.identifier }}
                                </A>
                            </td>
                            <td>
                                <span
                                    v-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_URL"
                                    class="text-muted">
                                    URL
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_IDENTIFIER"
                                    class="text-muted">
                                    Identifier
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2ExternalRelationVariant.EXTERNAL_RELATION_VARIANT_CUSTOM"
                                    class="text-muted">
                                    {{ relation.customVariant }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <table v-else class="table table-vcenter text-start">
                    <thead>
                        <tr>
                            <th class="text-start">ID</th>
                            <th>RESOURCE</th>
                            <th>TYPE</th>
                        </tr>
                    </thead>

                    <thead v-if="inc_int_rel.length > 0">
                        <tr>
                            <th colspan="3">Incoming</th>
                        </tr>
                    </thead>

                    <tbody v-if="props.relations">
                        <tr v-for="relation in inc_int_rel">
                            <td class="text-start">
                                <A :href="`/objects/${relation.resourceId}`" exact=true class="">
                                    <div>
                                        <IconArrowBigLeftLines :size="24" :stroke-width="2" />
                                        <span class="ms-2">{{ relation.resourceId }}</span>
                                    </div>
                                </A>
                            </td>
                            <td>
                                <span class="text-muted">
                                    {{ toResourceType(relation.resourceVariant) }}
                                </span>
                            </td>
                            <td>
                                <span v-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                                    relation.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND
                                    " class="text-muted">
                                    Parent
                                </span>
                                <span v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                                    relation.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND
                                    " class="text-muted">
                                    Child
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN"
                                    class="text-muted">
                                    Origin
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION"
                                    class="text-muted">
                                    Version
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA"
                                    class="text-muted">
                                    Metadata
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY"
                                    class="text-muted">
                                    Policy
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM"
                                    class="text-muted">
                                    {{ relation.customVariant }}
                                </span>
                            </td>
                        </tr>
                    </tbody>

                    <thead v-if="inc_out_rel.length > 0">
                        <tr>
                            <th colspan="3">Outgoing</th>
                        </tr>
                    </thead>
                    <tbody v-if="props.relations">
                        <tr v-for="relation in inc_out_rel">
                            <td class="text-start">
                                <A :href="`/objects/${relation.resourceId}`" exact=true class="">
                                    <div>
                                        <IconArrowBigRightLines :size="24" :stroke-width="2" />
                                        <span class="ms-2">{{ relation.resourceId }}</span>
                                    </div>
                                </A>
                            </td>
                            <td>
                                {{ toResourceType(relation.resourceVariant) }}
                            </td>
                            <td>
                                <span v-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                                    relation.direction === v2RelationDirection.RELATION_DIRECTION_INBOUND
                                    " class="text-muted">
                                    Parent
                                </span>
                                <span v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO &&
                                    relation.direction === v2RelationDirection.RELATION_DIRECTION_OUTBOUND
                                    " class="text-muted">
                                    Child
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN"
                                    class="text-muted">
                                    Origin
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION"
                                    class="text-muted">
                                    Version
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA"
                                    class="text-muted">
                                    Metadata
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY"
                                    class="text-muted">
                                    Policy
                                </span>
                                <span
                                    v-else-if="relation.definedVariant === v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM"
                                    class="text-muted">
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