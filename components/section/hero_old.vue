<template>
  <!-- Hero -->
  <!-- <div class="max-w-[85rem] mx-auto px-4 sm:px-6 lg:px-8"> -->
  <div class="flex h-screen">
    <div class="container mx-auto mt-20">
      <!-- Grid -->
      <div class="grid lg:grid-cols-7 lg:gap-x-8 xl:gap-x-12 lg:items-center">
        <div class="lg:col-span-3">
          <h1
            class="block text-3xl font-bold text-gray-800 sm:text-4xl lg:text-6xl lg:leading-tight dark:text-white"
          >
            Start your journey with
            <!-- <span class="text-blue-800">
                            Aruna
                        </span>  -->
            <NuxtImg
              src="aruna_light.png"
              style="display: inline-block !important; height: 1em"
            />
          </h1>
          <!-- 
                    <h1
                        class="block text-3xl font-bold text-gray-800 sm:text-4xl md:text-5xl lg:text-6xl dark:text-white">
                        Your distributed scientific data mesh
                    </h1>
                     -->
          <p class="mt-3 text-lg text-gray-800 dark:text-gray-400">
            Fast, secure, distributed and domain-agnostic data storage with
            sophisticated metadata management according to FAIR principles.
            Store and organize your data in new ways, share it with your
            colleagues and partners. Transparent data management made easy.
          </p>

          <div
            class="mt-5 lg:mt-8 flex flex-col items-center gap-2 sm:flex-row sm:gap-3"
          >
            <div class="w-full sm:w-auto">
              <label for="hero-input" class="sr-only">Search</label>
              <input
                type="text"
                id="hero-input"
                name="hero-input"
                class="py-3 px-4 block w-full xl:min-w-72 border-gray-200 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
                placeholder="Enter your email"
              />
            </div>
            <a
              class="w-full sm:w-auto py-3 px-4 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
              href="#"
            >
              Join Mailing List
            </a>
          </div>

          <!-- Brands -->
          <div class="mt-6 lg:mt-12">
            <!-- <span class="text-xs font-medium text-gray-800 uppercase dark:text-gray-200">Sponsored by:</span> -->

            <div
              class="py-3 flex items-center text-sm text-gray-800 before:flex-[1_1_0%] before:border-t before:border-gray-200 before:me-6 after:flex-[1_1_0%] after:border-t after:border-gray-200 after:ms-6 dark:text-white dark:before:border-gray-600 dark:after:border-gray-600"
            >
              Sponsored by
            </div>

            <div class="mt-4 flex gap-x-8">
              <NuxtImg
                src="fair-ds-logo.png"
                class="w-40 h-auto"
                fit="inside"
              />
              <NuxtImg src="microbiota.png" class="w-24 h-auto" fit="contain" />
              <NuxtImg src="biodiv.png" class="w-40 h-auto" fit="inside" />
              <NuxtImg src="denbi.svg" class="w-28 h-auto" fit="contain" />
            </div>
          </div>
          <!-- End Brands -->
        </div>
        <!-- End Col -->

        <div class="lg:col-span-4 mt-10 lg:mt-0">
          <NuxtImg
            class="w-full rounded-xl"
            src="hero_screen_dummy.png"
            alt="Image Description"
          />
        </div>
        <!-- End Col -->
      </div>
      <!-- End Grid -->
    </div>
    <!-- End Hero -->
  </div>
</template>
