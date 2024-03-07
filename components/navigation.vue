<script setup lang="ts">
import { IconBook, IconSearch, IconBrandGithub, 
    IconUserScan, IconBell, IconBucket, 
    IconUserUp, IconLogout, IconUserCircle 
} from '@tabler/icons-vue';

const oidc = useOidc()
const anchor = ref(0)
</script>

<template>
    <div class="sticky-top">
        <header class="navbar navbar-expand-md d-print-none" data-bs-theme="dark">
            <div class="container-xl">
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu"
                    aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>

                <!-- Brand -->
                <h1 class="navbar-brand navbar-brand-light d-none-navbar-horizontal pe-0 pe-md-3">
                    <NuxtLink to="/">
                        <img src="assets/imgs/aruna_icon.png" width="32" height="32" alt="Aruna"
                            class="navbar-brand-image me-3" />
                        Aruna
                    </NuxtLink>
                </h1>

                <div class="navbar-nav flex-row order-md-last">
                    <!-- User menu -->
                    <div :key="anchor" v-if="oidc.isLoggedIn" class="nav-item dropdown">
                        <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown"
                            data-bs-auto-close="outside" role="button" aria-expanded="false"
                            aria-label="Open user menu">
                            <span>
                                <IconUserCircle class="icon" />
                            </span>
                            <div class="d-none d-xl-block ps-2">
                                <div>{{ oidc.user.displayName }}</div>
                                <div v-if="oidc.user.isAdmin" class="mt-1 small text-muted">
                                    {{ oidc.user.active ? "Admin" : "Admin (inactive)" }}
                                </div>
                                <div v-else class="mt-1 small text-muted">
                                    {{ oidc.user.active ? "User" : "User (inactive)" }}
                                </div>
                            </div>
                        </a>
                        <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                            <NuxtLink to="/user/account" class="dropdown-item">
                                <IconUserScan class="icon nav-link-icon" />
                                Account
                            </NuxtLink>
                            <NuxtLink to="/notifications" class="dropdown-item disabled" tabindex="-1"
                                aria-label="Coming soon">
                                <IconBell class="icon nav-link-icon" />
                                <!-- <span class="badge bg-red"></span> -->
                                Messages
                            </NuxtLink>
                            <NuxtLink to="/user/resources" class="dropdown-item">
                                <IconBucket class="icon nav-link-icon" />
                                Resources
                            </NuxtLink>
                            <NuxtLink v-if="oidc.user?.attributes?.globalAdmin" to="/user/admin" class="dropdown-item">
                                <IconUserUp class="icon nav-link-icon" />
                                Administration
                            </NuxtLink>
                            <a @click="oidc.logout()" class="dropdown-item">
                                <IconLogout class="icon nav-link-icon" />
                                Logout
                            </a>
                        </div>
                    </div>
                    <button v-else @click="oidc.login()" class="btn btn-outline-success btn-sm px-4 me-sm-3 mt-2 mb-2">
                        Login
                    </button>
                </div>
                <div class="collapse navbar-collapse" id="navbar-menu">
                    <div class="d-flex flex-column flex-md-row-reverse flex-fill align-items-stretch align-items-md-center pe-md-5">
                        <ul class="navbar-nav">

                            <li class="nav-item">
                                <NuxtLink class="nav-link" to="/explore">
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <IconSearch class="icon" />
                                    </span>
                                    <span class="nav-link-title">Explore</span>
                                </NuxtLink>
                            </li>

                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="#navbar-third" data-bs-toggle="dropdown"
                                    data-bs-auto-close="outside" role="button" aria-expanded="false">
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <IconBook class="icon" />
                                    </span>
                                    <span class="nav-link-title">Docs</span>
                                </a>
                                <div class="dropdown-menu">
                                    <a class="dropdown-item"
                                        href="https://arunastorage.github.io/Documentation#aos-components"
                                        target="_blank">
                                        Components
                                    </a>
                                    <a class="dropdown-item" href="https://arunastorage.github.io/Documentation/latest/"
                                        target="_blank">
                                        Getting started
                                    </a>
                                    <a class="dropdown-item" href="https://github.com/ArunaStorage/ArunaAPI"
                                        target="_blank">
                                        API
                                    </a>
                                </div>
                            </li>

                            <!-- GitHub reference -->
                            <li class="nav-item">
                                <NuxtLink to="https://github.com/ArunaStorage/ArunaServer" target="_blank"
                                    class="nav-link btn-outline" style="border: 1px solid #555 !important"
                                    rel="noreferrer">
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <IconBrandGithub class="icon" />
                                    </span>
                                    <span class="nav-link-title">Source Code</span>
                                </NuxtLink>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </header>
    </div>
</template>