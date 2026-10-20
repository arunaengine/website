<script setup lang="ts">
import Supporters from "~/components/custom-ui/frontpage/Supporters.vue";
import FeaturesAruna from "~/components/custom-ui/frontpage/FeaturesAruna.vue";
import FeaturesGeneral from "~/components/custom-ui/frontpage/FeaturesGeneral.vue";
import Newsletter from "~/components/custom-ui/frontpage/Newsletter.vue";
import Faq from "~/components/custom-ui/frontpage/Faq.vue";
import Hero from "~/components/custom-ui/frontpage/Hero.vue";
import V3Callout from "~/components/custom-ui/frontpage/V3Callout.vue";
</script>
<template>
  <div class="flex flex-col flex-grow">
    <NavigationTop/>

    <!-- Frontpage Sections -->
    <Hero/>
    <FeaturesAruna/>
    <FeaturesGeneral/>
    <V3Callout/>
    <Newsletter/>
    <Faq/>
    <Supporters/>
    <!-- END Frontpage Sections -->

    <Footer/>
  </div>
</template>