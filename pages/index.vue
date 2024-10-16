<script setup lang="ts">
import Supporters from "~/components/custom-ui/frontpage/Supporters.vue";
import FeaturesAruna from "~/components/custom-ui/frontpage/FeaturesAruna.vue";
import FeaturesGeneral from "~/components/custom-ui/frontpage/FeaturesGeneral.vue";
</script>
<template>
  <div class="flex flex-col flex-grow">
    <!-- Header + Navigation -->
    <NavigationTop/>
    <!-- END Header + Navigation -->

    <!-- Frontpage Sections -->
    <SectionHero/>
    <FeaturesAruna/>
    <FeaturesGeneral/>
    <SectionNewsletter/>
    <SectionFaq/>
    <Supporters/>
    <!-- END Frontpage Sections -->

    <Footer/>
  </div>
</template>