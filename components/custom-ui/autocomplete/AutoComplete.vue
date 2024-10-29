<script setup lang="ts">
/* ----- PROPERTIES ----- */
const props = defineProps<{
  selectedValue: string;
  onSelectedValueChange: (value: string) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  items: { value: string; label: string }[];
  isLoading?: boolean;
  emptyMessage?: string;
  placeholder?: string;
}>()
/* ----- END PROPERTIES ----- */

const open = ref(false);

var labels = Object();
for (const item of props.items) {
  labels[item.value] = item.label;
}

var values = Object();
for (const item of props.items) {
  values[item.value] = item.value;
}

/*
const labels2 = props.items.reduce((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {} as Record<string, string>);
*/

const reset = () => {
  props.onSelectedValueChange("");
  props.onSearchValueChange("");
};

const onSelectItem = (inputValue: string) => {
  if (inputValue === props.selectedValue) {
    reset();
  } else {
    props.onSelectedValueChange(values[inputValue]);
    props.onSearchValueChange(labels[inputValue] ?? "");
  }
  open.value = false;
};

</script>

<template>
  <div className="flex items-center">
    <Popover open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <PopoverAnchor asChild>
          <CommandInput
</template>