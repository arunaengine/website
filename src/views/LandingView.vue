<script setup lang="ts">
import LandingNav from '@/components/landing/LandingNav.vue'
import Hero from '@/components/landing/Hero.vue'
import FeatureGrid from '@/components/landing/FeatureGrid.vue'
import ArchitectureSection from '@/components/landing/ArchitectureSection.vue'
import CallToAction from '@/components/landing/CallToAction.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
</script>

<template>
  <div class="flex min-h-full flex-col">
    <LandingNav />
    <main>
      <Hero />
      <FeatureGrid />
      <ArchitectureSection />
      <CallToAction />
    </main>
    <LandingFooter />
  </div>
</template>
