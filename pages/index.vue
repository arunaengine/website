<script setup lang="ts">
import Supporters from "~/components/custom-ui/frontpage/Supporters.vue";
import FeaturesAruna from "~/components/custom-ui/frontpage/FeaturesAruna.vue";
import FeaturesGeneral from "~/components/custom-ui/frontpage/FeaturesGeneral.vue";
import Newsletter from "~/components/custom-ui/frontpage/Newsletter.vue";
import Faq from "~/components/custom-ui/frontpage/Faq.vue";
import Hero from "~/components/custom-ui/frontpage/Hero.vue";
</script>
<template>
  <div class="flex flex-col flex-grow">
    <div class="bg-[url('/public/imgs/global-bg.webp')] bg-cover bg-fixed bg-center bg-no-repeat">
      <!-- Header + Navigation -->
      <NavigationTop/>
      <!-- END Header + Navigation -->

      <!-- Frontpage Sections -->
      <Hero/>
    </div>
    <FeaturesAruna/>
    <FeaturesGeneral/>
    <Newsletter/>
    <Faq/>
    <Supporters/>
    <!-- END Frontpage Sections -->

    <Footer/>
  </div>
</template>