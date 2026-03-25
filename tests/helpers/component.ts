import { flushPromises, mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'

type StubMap = Record<string, unknown>

const defaultStubs: StubMap = {
  Dialog: { template: '<div data-test="dialog"><slot /></div>' },
  DialogTrigger: { template: '<div data-test="dialog-trigger"><slot /></div>' },
  DialogContent: { template: '<div data-test="dialog-content"><slot /></div>' },
  DialogHeader: { template: '<div data-test="dialog-header"><slot /></div>' },
  DialogTitle: { template: '<div data-test="dialog-title"><slot /></div>' },
  DialogDescription: { template: '<div data-test="dialog-description"><slot /></div>' },
  DialogFooter: { template: '<div data-test="dialog-footer"><slot /></div>' },
  Button: {
    props: ['type', 'form', 'disabled', 'variant'],
    template: '<button :type="type" :form="form" :disabled="disabled"><slot /></button>',
  },
  Checkbox: {
    props: ['checked'],
    template: '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
  },
  Input: {
    props: ['modelValue', 'type', 'placeholder'],
    template: '<input :type="type" :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  FormField: {
    props: ['name', 'type'],
    template: '<div data-test="form-field"><slot :componentField="{}" :value="false" /></div>',
  },
  FormItem: { template: '<div data-test="form-item"><slot /></div>' },
  FormLabel: { template: '<label data-test="form-label"><slot /></label>' },
  FormControl: { template: '<div data-test="form-control"><slot /></div>' },
  FormMessage: { template: '<div data-test="form-message"><slot /></div>' },
  Popover: { template: '<div data-test="popover"><slot /></div>' },
  PopoverTrigger: { template: '<div data-test="popover-trigger"><slot /></div>' },
  PopoverContent: { template: '<div data-test="popover-content"><slot /></div>' },
  Select: { template: '<div data-test="select"><slot /></div>' },
  SelectTrigger: { template: '<div data-test="select-trigger"><slot /></div>' },
  SelectValue: { template: '<div data-test="select-value"><slot /></div>' },
  SelectContent: { template: '<div data-test="select-content"><slot /></div>' },
  SelectGroup: { template: '<div data-test="select-group"><slot /></div>' },
  SelectLabel: { template: '<div data-test="select-label"><slot /></div>' },
  SelectItem: { template: '<div data-test="select-item"><slot /></div>' },
  Calendar: { template: '<div data-test="calendar"></div>' },
  TooltipProvider: { template: '<div data-test="tooltip-provider"><slot /></div>' },
  Tooltip: { template: '<div data-test="tooltip"><slot /></div>' },
  TooltipTrigger: { template: '<div data-test="tooltip-trigger"><slot /></div>' },
  TooltipContent: { template: '<div data-test="tooltip-content"><slot /></div>' },
  Pagination: { template: '<div data-test="pagination"><slot :page="1" /></div>' },
  PaginationList: {
    template: '<div data-test="pagination-list"><slot :items="[{ type: \"page\", value: 1 }]" /></div>',
  },
  PaginationFirst: { template: '<button data-test="pagination-first"></button>' },
  PaginationPrev: { template: '<button data-test="pagination-prev"></button>' },
  PaginationListItem: { template: '<div data-test="pagination-item"><slot /></div>' },
  PaginationEllipsis: { template: '<div data-test="pagination-ellipsis"></div>' },
  PaginationNext: { template: '<button data-test="pagination-next"></button>' },
  PaginationLast: { template: '<button data-test="pagination-last"></button>' },
  DropdownMenu: { template: '<div data-test="dropdown-menu"><slot /></div>' },
  DropdownMenuTrigger: { template: '<button data-test="dropdown-trigger"><slot /></button>' },
  DropdownMenuContent: { template: '<div data-test="dropdown-content"><slot /></div>' },
  DropdownMenuLabel: { template: '<div data-test="dropdown-label"><slot /></div>' },
  DropdownMenuSeparator: { template: '<hr data-test="dropdown-separator" />' },
  DropdownMenuItem: { template: '<div data-test="dropdown-item"><slot /></div>' },
  DropdownMenuSub: { template: '<div data-test="dropdown-sub"><slot /></div>' },
  DropdownMenuSubTrigger: { template: '<div data-test="dropdown-sub-trigger"><slot /></div>' },
  DropdownMenuPortal: { template: '<div data-test="dropdown-portal"><slot /></div>' },
  DropdownMenuSubContent: { template: '<div data-test="dropdown-sub-content"><slot /></div>' },
  Separator: { template: '<hr data-test="separator" />' },
}

export function mountWithDefaults<T extends Component>(
  component: T,
  options: MountingOptions<ComponentPublicInstance> = {}
): VueWrapper {
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      stubs: {
        ...defaultStubs,
        ...options.global?.stubs,
      },
    },
  })
}

export async function mountWithNuxt<T extends Component>(
  component: T,
  options: MountingOptions<ComponentPublicInstance> = {}
): Promise<VueWrapper> {
  const wrapper = mountWithDefaults(component, options)
  await flushPromises()
  await nextTick()
  return wrapper
}

export async function mountWithNuxtSuspense<T extends Component>(
  component: T,
  options: MountingOptions<ComponentPublicInstance> = {}
): Promise<VueWrapper> {
  const wrapped = defineComponent({
    components: {
      TestedComponent: component,
    },
    data() {
      return {
        forwardedProps: options.props ?? {},
      }
    },
    template: '<Suspense><TestedComponent v-bind="forwardedProps" /></Suspense>',
  })

  const wrapper = mountWithDefaults(wrapped, {
    ...options,
    props: undefined,
  })

  await flushPromises()
  await nextTick()
  await flushPromises()

  return wrapper
}
