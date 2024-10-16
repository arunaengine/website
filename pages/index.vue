<script setup lang="ts">
import Supporters from "~/components/custom-ui/frontpage/Supporters.vue";
</script>
<template>
  <div class="flex flex-col flex-grow">
    <!-- Header + Navigation -->
    <NavigationTop/>
    <!-- END Header + Navigation -->

    <!-- Frontpage Sections -->
    <SectionHero/>
    <SectionFeatures/>
    <SectionFeatures2/>
    <SectionNewsletter/>
    <SectionFaq/>
    <Supporters/>
    <!-- END Frontpage Sections -->

    <Footer/>
  </div>
</template>