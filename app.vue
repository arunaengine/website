<script setup lang="ts">
import type { v2User } from "./composables/aruna_api_json";

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

const user: v2User | string = await fetchUser(undefined);
let userObject: v2User | undefined = undefined;

// Provide user object globally read-only
const userRef: Ref<v2User | undefined> = ref(undefined)
provide('userRef', readonly(userRef))

const fetchError = ref(false);
const fetchErrorMsg = ref(""); // Can be displayed for the user

let isNotRegistered = false;
if (typeof user === "string") {
  userRef.value = undefined
  if (user === "not_registered") {
    console.log("User not registered")
    isNotRegistered = true
  }
} else if (user.displayName === undefined) {
  console.log("Should not exist anymore. What is going on?")
} else {
  userRef.value = user
  userObject = user
}

const is_registered = useState("register", () => isNotRegistered)
const user_state = useState("user", () => userObject)
</script>

<template>
  <!-- Header + Navigation -->
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
  <NavigationSidebar />
</template>
