<template>
    <!-- <div class="container-xl"> -->
        <section class="section">
            <div class="container-xl">
                <IntroSection />
            </div>
        </section>

        <section class="section">
            <div class="container-xl">
                <FeatureCards />
            </div>
            <div class="outer">
                <div class="wave"></div>
                <div class="wave"></div>
            </div>
        </section>

        <section class="section ocean-bg pb-4">
            <div class="container-xl">
                <MetaSection />
            </div>
            <div v-for="index in 10" :key="index" :class="`bubble bubble--'+${index}`"></div>
        </section>

        <section class="section pt-4 pb-4">
            <div class="container-xl">
                <TimelineSection />
            </div>
        </section>

        <section id="faq" class="section pt-2 pb-4">
            <div class="container-xl">
                <FaqSection />
            </div>
        </section>
        <section class="section pt-2 pb-4">
            <div class="container-xl">
                <PartnerSection />
            </div>
        </section>
<!--     </div>
 --></template>