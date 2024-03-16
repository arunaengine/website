<script setup lang="ts">
import { IconArrowLeft, IconPlus } from '@tabler/icons-vue';
import { v2DataClass } from '~/composables/aruna_api_json';

// Check refresh and access before navigation

//TODO: GetUserResources
const resources = await fetchUserResources(oidc.user)
console.log(resources)

const name = ref('')
const description = ref('')

async function tryCreateProject() {
    console.log(name.value)
    console.log(description.value)

    const project = await createProject(name.value, description.value, [], v2DataClass.DATA_CLASS_PUBLIC)
    console.log("Successfully created Project: " + project)
}

// Used for back link to last page in navigation history
const router = useRouter()
</script>

<template>
    <div class="container-xl text-start mt-3">
        <div class="row mb-4">
            <div class="col">
                <div class="page-pretitle text-start">Personal Permissions</div>
                <h2 class="page-title">Resources</h2>
            </div>
            <div class="col-auto ms-auto d-print-none text-end">
                <div class="btn-list">
                    <a @click="router.back()" class="btn btn-ghost-secondary d-none d-sm-inline-block pe-0 ps-3">
                        <IconArrowLeft class="icon" />
                    </a>
                    <NuxtLink to="/objects/create" class="btn btn-primary d-none d-sm-inline-block">
                        <IconPlus class="icon" />
                        Create new
                    </NuxtLink>
                    <!-- 
                    <button @click="tryCreateProject" class="btn btn-primary d-none d-sm-inline-block">
                        <IconPlus class="icon" />
                        Create new
                    </button>
                     -->
                </div>
            </div>
        </div>
        <div class="row mt-2">
            <div class="col">

                <!-- 
                <div class="mb-3">
                    <label class="form-label">Name</label>
                    <input v-model="name" type="text" class="form-control" name="project-name-input" placeholder="Project name" />
                </div>
            </div>
            <div class="col">
                <div class="mb-3">
                    <label class="form-label">Description</label>
                    <input v-model="description" type="text" class="form-control" name="peroject-description-input"
                        placeholder="Project description" />
                </div>
 -->


                <Suspense>
                    <div v-for="resource in resources" class="card mb-2">
                        <ResourceCard v-if="resource.resource" :resource="resource.resource" />
                    </div>

                    <!-- 
                    <div v-for="" class="card mb-2">
                        {entry.get_card_status()}
                        <div class="card-body d-flex container flex-column">
                            {entry.get_ribbon()} <div class="row">
                                <div class="col-4">
                                    <div>
                                        <a class="text-primary" href=absolute_link()>
                                            <h3>{name}</h3>
                                        </a>
                                        <a class="subheader" href=absolute_link()>
                                            <h4>{id}</h4>
                                        </a>
                                    </div>
                                    {entry.get_status()}
                                    {entry.get_stats()}
                                    {res.1.get_visualization()}
                                </div>
                                <div class="col border-start me-4 container">
                                    <div class="border-bottom pb-3 mb-2">{entry.get_key_values()}</div>
                                    <div class="row">
                                        <h4 class="subheader mb-0">"Description"</h4>
                                        <p class="text-secondary mb-0">{entry.description}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    -->

                </Suspense>
            </div>
        </div>
    </div>
</template>