<script setup lang="ts">
import { ref } from 'vue'
import '@/assets/landing/base.css'
import '@/assets/landing/hero.css'
import '@/assets/landing/sections.css'
import '@/assets/landing/portal.css'
import '@/assets/landing/portal-views.css'
import LandingHeader from '@/components/landing/LandingHeader.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import ProblemSection from '@/components/landing/ProblemSection.vue'
import CapabilitySection from '@/components/landing/CapabilitySection.vue'
import PortalShowcase from '@/components/landing/PortalShowcase.vue'
import RepositorySection from '@/components/landing/RepositorySection.vue'
import FeatureSection from '@/components/landing/FeatureSection.vue'
import StartSection from '@/components/landing/StartSection.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'

const showcase = ref<InstanceType<typeof PortalShowcase> | null>(null)
</script>

<template>
  <div class="lp">
    <LandingHeader />
    <main class="landing">
      <HeroSection />
      <ProblemSection />
      <CapabilitySection @open="(view) => showcase?.select(view)" />
      <PortalShowcase ref="showcase" />
      <RepositorySection />
      <FeatureSection />
      <StartSection />
    </main>
    <SiteFooter />
  </div>
</template>
