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
  <Navigation />
  <!-- <NavigationLegacy /> -->

  <!-- Main body -->
  <div>
    <NuxtLoadingIndicator />
    <NuxtPage />
  </div>

  <!-- Footer -->
  <footer class="container-xl d-flex flex-wrap justify-content-between align-items-center py-3 my-4 border-top">
    <p class="col-md-4 mb-0 text-muted">© 2024 Aruna Storage Team</p>
    <a href="https://tabler.io/"
      class="col-md-4 d-flex align-items-center justify-content-center mb-3 mb-md-0 me-md-auto link-dark text-muted">
      Built with tabler.io
    </a>
    <ul class="nav col-md-4 justify-content-end">
      <li class="nav-item">
        <a href="/" class="nav-link px-2 text-muted">Home</a>
      </li>
      <li class="nav-item">
        <a href="/#faq" class="nav-link px-2 text-muted">FAQs</a>
      </li>
      <li class="nav-item">
        <a href="/about" class="nav-link px-2 text-muted">About</a>
      </li>
      <li class="nav-item">
        <a href="/imprint" class="nav-link px-2 text-muted">Imprint</a>
      </li>
      <li class="nav-item">
        <a href="/tos" class="nav-link px-2 text-muted">Terms of Service</a>
      </li>
    </ul>
  </footer>
</template>
