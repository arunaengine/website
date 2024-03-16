<script setup lang="ts">
import type { v2User } from './composables/aruna_api_json';

// Returns Vue component
//const oidc = useOidc();
const fetchError = ref(false);
const fetchErrorMsg = ref("");

useHead({
  title: "Aruna | The data orchestration engine",
  meta: [
    {
      name: "description",
      content: "My amazing site.",
    },
  ],
});


const route = useRoute();
var user: v2User | undefined = await fetchUser();
if (user) {
  console.log("User is logged in");
  console.log(user);
}

const user_state = useState('user', () => user?.displayName as String)

const anchor = ref(0);

</script>

<template>
  <!-- Header + Navigation -->
  <Sidebar />
  <!-- Main body -->
  <div
    class="flex flex-col flex-grow md:min-h-screen bg-gradient-to-b from-aruna-800/[.30] via-transparent"
  >
    <!-- Body -->
    <NuxtLoadingIndicator />
    <NuxtPage />
  </div>
</template>
