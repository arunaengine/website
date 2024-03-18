<script setup lang="ts">
import type { v2User } from "./composables/aruna_api_json";

// Returns Vue component
//const oidc = useOidc();
const fetchError = ref(false);
const fetchErrorMsg = ref("");

useHead({
  title: "Aruna | The data orchestration engine",
  meta: [
    {
      name: "description",
      content:
        "Aruna is a modern data orchestration engine that enables users to connect disparate data sources, transform and enrich data, and build data pipelines in a distributed multi-cloud.",
    },
  ],
});

const user: v2User | string = await fetchUser();
var displayName: string | undefined = undefined;

var isNotRegistered = false;
if (typeof user === "string") {
  if (user === "not_registered") {
    console.log("User not registered");
    isNotRegistered = true;
  }
} else {
  displayName = user?.displayName;
}

const is_registered = useState("register", () => isNotRegistered);
const user_state = useState("user", () => displayName);
</script>

<template>
  <!-- Header + Navigation -->
  <Sidebar />
  <!-- Main body -->
  <div
    class="flex flex-col flex-grow md:min-h-screen px-6 py-2 bg-gradient-to-b from-aruna-800/[.30] via-transparent"
  >
    <ClientOnly fallback-tag="span" fallback="">
      <ModalRegister v-if="isNotRegistered" />
    </ClientOnly>
    <!-- Body -->
    <NuxtLoadingIndicator />
    <NuxtPage />
  </div>
</template>
