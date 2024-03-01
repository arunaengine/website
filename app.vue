<script lang="ts">
// Returns Vue component
import { IconHome, IconSearch, IconInfoSquareRounded, IconBook, IconCylinder } from '@tabler/icons-vue';

export default {
  components: { IconHome, IconSearch, IconInfoSquareRounded, IconBook, IconCylinder }
};
</script>

<template>
  <!-- Header + Navigation -->
  <div class="sticky-top">
    <header class="navbar navbar-expand-md d-print-none sticky-top" data-bs-theme="dark">
      <div class="container-xl">
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu"
          aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>

        <h1 class="navbar-brand navbar-brand-light d-none-navbar-horizontal pe-0 pe-md-3">
          <a href="/">
            <img src="assets/imgs/aruna_icon.png" width="32" height="32" alt="Aruna" class="navbar-brand-image me-3" />
            Aruna
          </a>
        </h1>

        <div class="navbar-nav flex-row order-md-last">
          <div class="collapse navbar-collapse" id="navbar-menu">
            <div class="container-xl d-block">
              <ul class="navbar-nav">
                <li class="nav-item">
                  <NuxtLink to="/" class="nav-link">
                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                      <IconHome :size="24" :stroke-width="2" />
                    </span>
                    <span class="nav-link-title">Home</span>
                  </NuxtLink>
                </li>

                <li class="nav-item">
                  <NuxtLink class="nav-link" to="/explore">
                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                      <IconSearch :size="24" :stroke-width="2" />
                    </span>
                    <span class="nav-link-title">Explore</span>
                  </NuxtLink>
                </li>

                <li class="nav-item">
                  <NuxtLink class="nav-link" to="/about">
                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                      <IconInfoSquareRounded :size="24" :stroke-width="2" />
                    </span>
                    <span class="nav-link-title">About</span>
                  </NuxtLink>
                </li>

                <li class="nav-item dropdown">
                  <a class="nav-link dropdown-toggle" href="#navbar-third" data-bs-toggle="dropdown"
                    data-bs-auto-close="outside" role="button" aria-expanded="false">
                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                      <IconBook :size="24" :stroke-width="2" />
                    </span>
                    <span class="nav-link-title">Docs</span>
                  </a>
                  <div class="dropdown-menu">
                    <a class="dropdown-item" href="https://arunastorage.github.io/Documentation#aos-components"
                      target="_blank">
                      Components
                    </a>
                    <a class="dropdown-item" href="https://arunastorage.github.io/Documentation/latest/" target="_blank">
                      Getting started
                    </a>
                    <a class="dropdown-item" href="https://github.com/ArunaStorage/ArunaAPI" target="_blank">
                      API
                    </a>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- GitHub reference -->
          <div class="nav-item d-none d-md-flex me-3">
            <div class="btn-list">
              <a href="https://github.com/ArunaStorage/ArunaServer" style="border: 1px solid #555 !important" class="btn"
                target="_blank" rel="noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24"
                  stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path
                    d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5">
                  </path>
                </svg>
                Source code
              </a>
            </div>
          </div>

          <div class="d-none d-md-flex">
            <!-- {dark_light}  -->

            <!-- User notifications -->
            <div class="nav-item dropdown d-none d-md-flex me-3 disabled">
              <a href="#" class="nav-link px-0 disabled" data-bs-toggle="dropdown" tabindex="-1" aria-label="Coming soon">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon text-gray" width="24" height="24" viewBox="0 0 24 24"
                  stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"></path>
                  <path d="M9 17v1a3 3 0 0 0 6 0v-1"></path>
                </svg>
                <!-- <span class="badge bg-red"></span> -->
              </a>
            </div>

            <!-- Login/Logout/User -->
            <a href="/provider" class="btn btn-outline-success btn-sm px-4 me-sm-3 mt-2 mb-2">
              Login
            </a>
          </div>
        </div>
      </div>
    </header>
  </div>

  <!-- Main body -->
  <div>
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
