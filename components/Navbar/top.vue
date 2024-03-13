<script setup lang="ts">
import {
  IconBrandGithub, IconUserCircle, IconMenu2, IconX, IconMoon, IconSun, IconLogout,
  IconUserScan, IconBell, IconBucket, IconChevronDown
} from '@tabler/icons-vue';

const oidc = useOidc()
const anchor = ref(0)

const HSThemeAppearance = {
  init() {
    const defaultTheme = 'default'
    let storage = window.localStorage
    let theme = storage.getItem('hs_theme') || defaultTheme

    if (document.querySelector('html').classList.contains('dark')) return
    this.setAppearance(theme)
  },
  _resetStylesOnLoad() {
    const $resetStyles = document.createElement('style')
    $resetStyles.innerText = `*{transition: unset !important;}`
    $resetStyles.setAttribute('data-hs-appearance-onload-styles', '')
    document.head.appendChild($resetStyles)
    return $resetStyles
  },
  setAppearance(theme: string, saveInStore = true, dispatchEvent = true) {
    const $resetStylesEl = this._resetStylesOnLoad()

    if (saveInStore) {
      localStorage.setItem('hs_theme', theme)
    }

    if (theme === 'auto') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
    }

    document.querySelector('html').classList.remove('dark')
    document.querySelector('html').classList.remove('default')
    document.querySelector('html').classList.remove('auto')

    document.querySelector('html').classList.add(this.getOriginalAppearance())

    setTimeout(() => {
      $resetStylesEl.remove()
    })

    if (dispatchEvent) {
      window.dispatchEvent(new CustomEvent('on-hs-appearance-change', { detail: theme }))
    }
  },
  getAppearance() {
    let theme = this.getOriginalAppearance()
    if (theme === 'auto') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
    }
    return theme
  },
  getOriginalAppearance() {
    const defaultTheme = 'default'
    if (localStorage) {
      return localStorage.getItem('hs_theme') || defaultTheme
    }
    return defaultTheme
  }
}
onMounted(() => {
  HSThemeAppearance.init()

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (HSThemeAppearance.getOriginalAppearance() === 'auto') {
      HSThemeAppearance.setAppearance('auto', false)
    }
  })

  window.addEventListener('load', () => {
    const $clickableThemes = document.querySelectorAll('[data-hs-theme-click-value]')
    const $switchableThemes = document.querySelectorAll('[data-hs-theme-switch]')

    $clickableThemes.forEach($item => {
      $item.addEventListener('click', () => HSThemeAppearance.setAppearance($item.getAttribute('data-hs-theme-click-value'), true, $item))
    })

    $switchableThemes.forEach($item => {
      $item.addEventListener('change', (e) => {
        HSThemeAppearance.setAppearance(e.target.checked ? 'dark' : 'default')
      })

      $item.checked = HSThemeAppearance.getAppearance() === 'dark'
    })

    window.addEventListener('on-hs-appearance-change', e => {
      $switchableThemes.forEach($item => {
        $item.checked = e.detail === 'dark'
      })
    })
  })
})
</script>

<template>
  <header class="flex flex-wrap sm:justify-start sm:flex-nowrap w-full bg-transparent sm:py-4 md:py-2 dark:bg-gray-800">
    <nav class="max-w-[85rem] w-full mx-auto px-4 flex flex-wrap basis-full items-center justify-between"
      aria-label="Global">

      <NuxtLink class="sm:order-1 flex-none text-xl font-semibold dark:text-white" href="/">
        <NuxtImg src="aruna_light.png" height="24px" />
        <!-- <NuxtImg v-else src="aruna_light.png" height="24px" /> -->
      </NuxtLink>

      <div id="navbar-alignment"
        class="hs-collapse hidden overflow-hidden transition-all duration-300 basis-full grow sm:grow-0 sm:basis-auto sm:block sm:order-2">
        <div class="flex flex-col gap-5 mt-5 sm:flex-row sm:items-center sm:mt-0 sm:ps-5">
          <NuxtLink
            class="font-medium text-gray-600 hover:text-gray-400 dark:text-gray-400 dark:hover:text-gray-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            to="/explore">
            <!-- <IconSearch class="flex-shrink-0 size-4 inline-block" /> -->
            Search
          </NuxtLink>

          <!-- Dropdown Start -->
          <div class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
            <button id="hs-mega-menu-basic-dr" type="button"
              class="flex items-center w-full text-gray-600 hover:text-gray-400 font-medium dark:text-gray-400 dark:hover:text-gray-500 ">
              Docs
              <svg class="ms-1 flex-shrink-0 size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <div
              class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 bg-white sm:shadow-md rounded-lg p-2 dark:bg-gray-800 sm:dark:border dark:border-gray-700 dark:divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden"
              style="">
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                target="_blank" href="https://github.com/ArunaStorage/ArunaAPI">
                API
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                target="_blank"
                href="https://arunastorage.github.io/Documentation/latest/get_started/basic_usage/00_index/">
                Getting Started
              </a>
              <a class="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                target="_blank"
                href="https://arunastorage.github.io/Documentation/latest/internal_data_structure/internal_data_structure/">
                Data Structure
              </a>
            </div>
          </div>
          <!-- Dropdown End -->

          <a class="border border-gray rounded p-2 px-4 font-medium text-gray-600 hover:text-gray-400 dark:text-gray-400 dark:hover:text-gray-500 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            target="_blank" href="https://github.com/ArunaStorage">
            <IconBrandGithub class="flex-shrink-0 size-4 inline-block" />
            Source Code
          </a>
        </div>
      </div>

      <div class="sm:order-3 flex items-center gap-x-2">
        <button type="button"
          class="sm:hidden hs-collapse-toggle p-2.5 inline-flex justify-center items-center gap-x-2 rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none dark:bg-transparent dark:border-gray-700 dark:text-white dark:hover:bg-white/10 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          data-hs-collapse="#navbar-alignment" aria-controls="navbar-alignment" aria-label="Toggle navigation">
          <IconMenu2 class="icon hs-collapse-open:hidden flex-shrink-0 size-4" />
          <IconX class="icon hs-collapse-open:block hidden flex-shrink-0 size-4" />
        </button>

        <button type="button"
          class="hs-dark-mode-active:hidden block hs-dark-mode group flex items-center px-3 text-gray-600 hover:text-blue-600 font-medium dark:text-gray-400 dark:hover:text-gray-500"
          data-hs-theme-click-value="dark">
          <IconMoon class="flex-shrink-0 size-4" />
        </button>
        <button type="button"
          class="hs-dark-mode-active:block hidden hs-dark-mode group flex items-center px-3 text-gray-600 hover:text-blue-600 font-medium dark:text-gray-400 dark:hover:text-gray-500"
          data-hs-theme-click-value="light">
          <IconSun class="flex-shrink-0 size-4" />
        </button>

        <!-- User Dropdown Start -->
        <div v-if="oidc.isLoggedIn" class="hs-dropdown [--strategy:static] sm:[--strategy:fixed] [--adaptive:none]">
          <button id="hs-mega-menu-basic-dr" type="button"
            class="border rounded p-2 flex items-center w-full text-gray-600 hover:text-arunaPrimary hover:border-arunaPrimary font-medium dark:text-gray-400 dark:hover:text-gray-500 dark:hover:border-gray-500 ">
            <IconUserCircle class="mx-1 flex-shrink-0 size-4" />
            {{ oidc.user.displayName }}
            <IconChevronDown class="ms-1 flex-shrink-0 size-4" />
          </button>
          <div
            class="hs-dropdown-menu transition-[opacity,margin] duration-[0.1ms] sm:duration-[150ms] hs-dropdown-open:opacity-100 opacity-0 sm:w-48 z-10 bg-white sm:shadow-md rounded-lg p-2 dark:bg-gray-800 sm:dark:border dark:border-gray-700 dark:divide-gray-700 before:absolute top-full sm:border before:-top-5 before:start-0 before:w-full before:h-5 hidden"
            style="">
            <NuxtLink
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              to="/user/account">
              <IconUserScan class="flex-shrink-0 size-4" />
              Account
            </NuxtLink>
            <button class="disabled:opacity-50 disabled:pointer-events-none flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              href="/user/messages" disabled>
              <IconBell class="flex-shrink-0 size-4" />
              Messages
          </button>
            <NuxtLink
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              to="/user/resources">
              <IconBucket class="flex-shrink-0 size-4" />
              Resources
            </NuxtLink>
            <a @click="oidc.logout()"
              class="flex items-center gap-x-2 py-2 px-3 rounded-lg cursor-pointer text-sm text-gray-800 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300">
              <IconLogout class="flex-shrink-0 size-4" />
              Logout
            </a>
          </div>
        </div>
        <!-- User Dropdown End -->
        <button v-else
          class="flex items-center rounded gap-x-2 font-medium text-gray-500 border hover:text-arunaPrimary sm:my-6 md:my-0 p-2 dark:text-gray-400 dark:hover:text-blue-500"
          @click="oidc.login()">
          Login
        </button>
      </div>
    </nav>
  </header>
</template>