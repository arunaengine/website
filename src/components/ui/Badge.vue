<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary/10 text-primary ring-1 ring-inset ring-primary/20',
        secondary:
          'border-transparent bg-muted text-foreground/80',
        outline:
          'border-border text-foreground/70',
        success:
          'border-transparent bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
        warn:
          'border-transparent bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20',
        destructive:
          'border-transparent bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/30',
        accent:
          'border-transparent bg-aruna-aqua/15 text-aruna-navy ring-1 ring-inset ring-aruna-aqua/40 dark:text-aruna-aqua dark:ring-aruna-aqua/25',
        royal:
          'border-transparent bg-aruna-royal/10 text-aruna-royal ring-1 ring-inset ring-aruna-royal/25 dark:bg-aruna-royal/20 dark:text-aruna-aqua dark:ring-aruna-royal/35',
        sky: 'border-transparent bg-aruna-sky/10 text-sky-700 ring-1 ring-inset ring-aruna-sky/25 dark:bg-aruna-sky/15 dark:text-aruna-aqua dark:ring-aruna-sky/25',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type Variant = VariantProps<typeof badgeVariants>['variant']

const props = defineProps<{ variant?: Variant; class?: string }>()
const classes = computed(() => cn(badgeVariants({ variant: props.variant }), props.class))
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
