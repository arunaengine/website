<script setup lang="ts">
// Returns Vue component
const oidc = useOidc()
async function refreshUser() {
  if (oidc.isLoggedIn) {
    oidc.setUser(await fetchUser())
  }
  forceRefreshAnchor()
}

const anchor = ref(0)
function forceRefreshAnchor() {
  anchor.value++
}

refreshUser()
</script>

<template>
  <!-- Header + Navigation -->
  <!-- <NavbarTop01 /> -->
  <NavbarTop />

  <!-- Main body -->
  <div class="flex flex-col flex-grow md:min-h-[85vh]">
    <!-- Body -->
    <NuxtLoadingIndicator />
    <!-- <div class="flex flex-grow"> -->
      <NuxtPage />
    <!-- </div> -->
    <!-- Footer -->
    
      
  
  </div>
  <Footer />
</template>
