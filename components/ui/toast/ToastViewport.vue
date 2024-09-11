<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { ToastViewport, type ToastViewportProps } from 'radix-vue'
import { cn } from '@/utils/shadcn'

const props = defineProps<ToastViewportProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <!--<ToastViewport v-bind="delegatedProps" :class="cn('fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]', props.class)" />-->
<!--
  <ToastViewport v-bind="delegatedProps" :class="cn('fixed top-0 left-[50%] z-[100] flex max-h-screen w-full translate-x-[-50%] flex-col-reverse p-4 sm:right-0 sm:flex-col md:max-w-[640px]', props.class)" />
-->
  <ToastViewport v-bind="delegatedProps" :class="cn('fixed left-[50%] translate-x-[-50%] top-0 z-[100] flex max-h-screen flex-col-reverse p-4 sm:flex-col md:max-w-[640px]', props.class)" />
</template>
