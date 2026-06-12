import { cva, type VariantProps } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-aruna-royal text-white shadow-sm hover:bg-aruna-navy dark:hover:bg-aruna-tagline',
        solid:
          'bg-aruna-navy text-white shadow-sm hover:bg-aruna-navy/90 dark:bg-white dark:text-aruna-navy dark:hover:bg-white/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-border bg-background text-foreground shadow-sm hover:bg-muted/80',
        secondary:
          'border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-muted',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        subtle:
          'bg-muted/70 text-foreground/80 hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        xl: 'h-12 rounded-lg px-8 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
