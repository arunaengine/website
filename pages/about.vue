<template>
  <NavigationTop/>

  <div class="min-h-[calc(100vh-110px)]">
    <div class="xl:container mx-8 xl:mx-auto mt-4 sm:mt-[5vh] p-4 border border-aruna-text rounded-md bg-aruna-bg/90">
      <h1 class="text-3xl font-bold text-aruna-text-accent uppercase">
        About us
      </h1>

      <h2 class="mt-6 mb-2 text-2xl font-bold text-aruna-text-accent">
        Who are we?
      </h2>
      <hr class="border-aruna-text">
      <p class="mt-2 p-4 text-aruna-text">
        We are a small team of developers from the Justus-Liebig-University in Gießen interested in developing advanced
        cloud native infrastructure and applications.
      </p>

      <h2 class="mt-6 mb-2 text-2xl font-bold text-aruna-text-accent">
        Why?
      </h2>
      <hr class="border-aruna-text">
      <p class="mt-2 p-4 text-aruna-text">
        As one of the major cloud locations for the de.NBI network, we have years of experience in developing and
        operating cloud-native infrastructures. With this expertise, we aim to further develop the fundamental way in
        which research data is managed and stored in the future.
      </p>

      <h2 class="mt-6 mb-2 text-2xl font-bold text-aruna-text-accent">
        What is our goal?
      </h2>
      <hr class="border-aruna-text">
      <p class="mt-2 p-4 text-aruna-text">
        Aruna is a multi-domain project that was first envisioned as the core cloud storage component of
        the Research Data Commons architecture in NFDI4Biodiversity and later adopted by the FAIR Data Spaces project
        and NFDI4Microbiota. This multi-domain expertise has resulted in a flexible and generalizable approach to the
        base data orchestration layer that can be adapted to any data management solution in any domain.
      </p>
    </div>
  </div>

  <Footer/>
</template>
<script setup lang="ts">
</script>