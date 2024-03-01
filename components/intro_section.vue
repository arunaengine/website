<script lang="ts">
export default {
    methods: {
        openLink(url: string, newTab: boolean) {
            if (newTab) {
                window.open(url, '_blank', 'noreferrer');
            } else {
                window.open(url, '_self', 'noreferrer');
            }
        },
    },
};
</script>

<template>
    <div class="px-4 pt-5 my-5 mt-6 text-center">
        <div class="overflow-hidden" style="max-height: 30vh;">
            <div class="container px-5">
                <img src="assets/imgs//aruna_light.png" class="img-fluid mb-4 hide-theme-dark" alt="Aruna Logo" width="700"
                    height="500" />
                <!--
                            <img
                            src="assets/imgs/aruna_dark.png"
                            class="img-fluid mb-4 hide-theme-light"
                            alt="Aruna Logo"
                            width="700"
                            height="500"
                            />
                        -->

            </div>
        </div>
        <h1 class="fw-bold hook pb-2">Your distributed scientific data mesh</h1>
        <div class="col-lg-10 mx-auto">
            <h3 class="lead mb-4">
                Fast, secure, distributed and domain-agnostic data storage with sophisticated metadata management
                according to
                <a class="text-primary" href="https://www.go-fair.org/fair-principles/">
                    FAIR
                </a>
                principles. Store and organize your data in new ways, share it with your colleagues and partners.
                Transparent data management made easy.
            </h3>
            <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
                <button type="button" class="btn btn-primary btn-lg px-4 me-sm-3"
                    @click="openLink('https://arunastorage.github.io/Documentation', true)">
                    Learn more!
                </button>
                <button type="button" class="btn btn-outline-secondary btn-lg px-4"
                    @click="openLink('mailto:support@aruna-storage.org', false)">
                    Contact us
                </button>
            </div>
        </div>
    </div>
</template>
