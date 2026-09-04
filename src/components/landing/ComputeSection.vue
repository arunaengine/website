<script setup lang="ts">
// Compute is a first-class part of the system: a job can travel to the data,
// or the data to a better place to run. Each lane shows one direction.
import Card from '@/components/ui/Card.vue'
import ComputeLane from '@/components/landing/ComputeLane.vue'
</script>

<template>
  <section id="compute" class="section bg-background">
    <div class="container max-w-6xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Compute</div>
        <h2 class="mt-3 font-display text-3xl font-semibold tracking-tight text-aruna-navy sm:text-4xl">
          Data where it belongs. Compute where it makes sense.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          Move the job to the data, or the data to the job. Results land back in the same governed place.
        </p>
      </div>
      <div class="mt-12 grid gap-4 lg:grid-cols-2">
        <Card class="flex flex-col gap-4 p-5">
          <h3 class="font-display text-base font-semibold text-aruna-navy">Move compute to the data.</h3>
          <ComputeLane direction="to-data" />
          <p class="text-sm text-muted-foreground">Large or restricted datasets stay put. The job runs next to them.</p>
        </Card>
        <Card class="flex flex-col gap-4 p-5">
          <h3 class="font-display text-base font-semibold text-aruna-navy">Move data to compute.</h3>
          <ComputeLane direction="to-compute" />
          <p class="text-sm text-muted-foreground">When another site is the better place to run, the data is staged there and the result comes back.</p>
        </Card>
      </div>
    </div>
  </section>
</template>
