<script setup lang="ts">
import type { v2GetResourceResponse } from '~/composables/aruna_api_json';

const route = useRoute()
const { data: response } = await useFetch<v2GetResourceResponse>(`https://api.dev.aruna-storage.org/v2/resources/${route.params.id}`)
const objectInfo = toObjectInfo(response.value?.resource?.resource, response.value?.resource?.permission)

/* Back link to last page in navigation history */
const router = useRouter()
function goBack() {
    router.back()
}
</script>

<template>
    <div class="page-wrapper d-print-none">
        <div class="page-header">
            <div class="container-xl">
                <div class="row g-2">
                    <div class="col">
                        <div class="page-pretitle text-start">Overview</div>
                        <h2 class="page-title">Resource</h2>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            <a @click="goBack" class="btn btn-ghost-secondary d-none d-sm-inline-block pe-0 ps-3">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-left"
                                    width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                                    fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M5 12l14 0"></path>
                                    <path d="M5 12l6 6"></path>
                                    <path d="M5 12l6 -6"></path>
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="page-body mt-2">
            <div class="container-xl mb-2">
                <div class="row">
                    <!-- Resource type -->
                    <div class="col-auto">
                        <ResourceTypeBadge :variant="objectInfo?.variant" />
                    </div>
                    <!-- DataClass -->
                    <div class="col-auto">
                        <ResourceDataclassBadge :dataClass="objectInfo?.data_class" />
                    </div>
                    <!-- Object Status -->
                    <div class="col-auto">
                        <ResourceStatusBadge :status="objectInfo?.object_status" />
                    </div>
                    <!-- Licenses -->
                    <div class="col-auto">
                        <ResourceLicenseBadge :license="objectInfo?.license" :meta="true" />
                    </div>
                    <div class="col-auto">
                        <ResourceLicenseBadge :license="objectInfo?.data_license" :meta="false" />
                    </div>
                    <!-- Permission -->
                    <div class="col-auto">
                        <ResourcePermissionBadge :permission="objectInfo?.permission" />
                    </div>
                </div>
            </div>
            <div class="container-xl">
                <div class="row row-deck row-cards">
                    <!-- Object ID -->
                    <SmallCard :icon_id='"ID"' :text="objectInfo?.id" :bg_color="Colors.Primary"
                        :text_color="Colors.Primary" />
                    <!-- Name -->
                    <SmallCard :icon_id='"Name"' :text="objectInfo?.name" :bg_color="Colors.Primary"
                        :text_color="Colors.Primary" />
                    <!-- Stats -->
                    <StatsCard :stats="objectInfo?.stats" />
                    <!-- Description -->
                    <FullCard :description="objectInfo?.description" />
                    <!-- Labels -->
                    <LabelsCard :key_values="objectInfo?.key_values" />
                    <!-- Hooks -->
                    <HooksCard :key_values="objectInfo?.key_values" />
                    <!-- Endpoints-->
                    <!-- Relations -->
                    <RelationsCard :relations="objectInfo?.relations" :external="true" />
                    <!-- Relations ... -->
                    <RelationsCard :relations="objectInfo?.relations" :external="false" />
                </div>
            </div>
        </div>
    </div>
</template>