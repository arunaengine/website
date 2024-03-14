<script setup lang="ts">
// Returns Vue component
const oidc = useOidc()
const fetchError = ref(false)
const fetchErrorMsg = ref('')


useHead({
  title: 'Aruna | The data orchestration engine',
  meta: [
    {
      name: 'description',
      content: 'My amazing site.'
    }
  ],
})

async function refreshUser() {
  if (oidc.isLoggedIn) {
    try {
      oidc.setUser(await fetchUser())
      fetchError.value = false
      fetchErrorMsg.value = ''

    } catch (error: unknown) {
      fetchError.value = true
      fetchErrorMsg.value = error instanceof Error ? error.message : 'Failed to fetch user info'
      console.error(fetchErrorMsg.value)
    }
  }
  forceRefreshAnchor()
}

const anchor = ref(0)

function forceRefreshAnchor() {
  anchor.value++
}

onMounted(() => refreshUser())
</script>

<template>
  <!-- Header + Navigation -->
  <Sidebar />
  <!-- Main body -->
  <div class="flex flex-col flex-grow md:min-h-screen">
    <!-- Body -->
    <NuxtLoadingIndicator/>
    <NuxtPage/>
  </div>
</template>
