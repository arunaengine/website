<script setup lang="ts">

interface EndpointsResponse {
    endpoints: Endpoint[]
}

interface Endpoint {
    id: String,
    epVariant: String,
    name: String,
    isPublic: Boolean,
    status: String
    hostConfigs: EndpointHostConfig[],
}

interface EndpointHostConfig {
    url: String,
    isPrimary: Boolean,
    ssl: Boolean,
    public: Boolean,
    hostVariant: String
}

const { data: endpoints } = await useFetch<EndpointsResponse>('https://api.dev.aruna-storage.org/v2/endpoints', {
    onRequest({ request, options }) {
        // E.g. set some the request headers
        options.headers = options.headers || {}
    },
    onRequestError({ request, options, error }) {
        // Handle the request errors
    },
    onResponse({ request, response, options }) {
        // Process the response data    
    },
    onResponseError({ request, response, options }) {
        // Handle the response errors
        endpoints.value = {} as EndpointsResponse
    }
})
</script>

<template>
    <p>Available endpoints: {{ endpoints?.endpoints.length }}</p>

    <div class="card" v-for="endpoint in endpoints?.endpoints">
        <div class="card-body">
            <h3 class="card-title">{{ endpoint.name }} - {{ endpoint.id }}</h3>
            <p>{{ endpoint.epVariant }}</p>
            <p>{{ endpoint.status }}</p>
        </div>
    </div>
</template>
