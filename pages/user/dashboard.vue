<script setup lang="ts">
import Dashboard from "~/components/custom-ui/dashboard/Dashboard.vue";
import type {User} from "~/composables/api_wrapper";

/* ----- GLOBAL USER ----- */
const user: Ref<User | undefined> = inject('userRef', ref(undefined))
/* ----- END GLOBAL USER ----- */
</script>
<template>
  <Dashboard :user="user"/>
  <!-- TODO: Skeleton -->
  <Footer/>
</template>