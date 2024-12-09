<script setup lang="ts">
import {
  IconCheck,
  IconHash,
  IconMail,
  IconSignature,
  IconUserCancel,
  IconUserCheck,
  IconX
} from "@tabler/icons-vue";
import {Skeleton} from '@/components/ui/skeleton'
import type {User} from "~/composables/api_wrapper";
import GroupDialog from "~/components/custom-ui/dialog/GroupDialog.vue";

interface ProfileProps {
  user: User,
  groups: GroupInfo[]
}

const props = defineProps<ProfileProps>()
const user = toRef(() => props.user)
const groups = toRef(() => props.groups)

watch(groups, () => console.log('[Profile] Updated groups: ', groups))


function displayDescription(description: string, maxLength: number = 50): string {
  return description.length > maxLength ? description.slice(0, maxLength) + " ..." : description
}
</script>/
<template>
  <!-- Display Profile Infos -->
  <div class="m-4 pb-6 flex flex-col lg:flex-row flex-wrap justify-start gap-x-6 gap-y-6">
    <!-- User Id Card -->
    <Card class="lg:basis-1/5">
      <ClientOnly fallback-tag="span">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-lg font-medium">
            User Id
          </CardTitle>
          <IconHash class="size-6 text-muted-foreground"/>
        </CardHeader>
        <CardContent>
          <div class="text-xl font-bold text-aruna-700">
            {{ user.id || 'N/A' }}
          </div>
        </CardContent>
        <template #fallback>
          <div class="flex items-center justify-start space-x-4 h-full ms-4">
            <Skeleton class="h-12 w-12 rounded-full"/>
            <div class="space-y-2">
              <Skeleton class="h-4 w-[250px]"/>
              <Skeleton class="h-4 w-[200px]"/>
            </div>
          </div>
        </template>
      </ClientOnly>
    </Card>
    <!-- End User Id Card -->

    <Card class="lg:basis-1/5">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-lg font-medium">
          Display Name
        </CardTitle>
        <IconSignature class="size-6 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl font-bold text-aruna-700">
          {{ user.first_name }} {{ user.last_name }}
        </div>
      </CardContent>
    </Card>

    <Card class="lg:basis-1/5">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-lg font-medium">
          Email
        </CardTitle>
        <IconMail class="size-6 text-muted-foreground"/>
      </CardHeader>
      <CardContent>
        <div class="text-xl font-bold text-aruna-700">
          {{ user.email || 'N/A' }}
        </div>
      </CardContent>
    </Card>

    <Card class="">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle class="text-lg font-medium">
          Active
        </CardTitle>
        <IconUserCheck class="h-4 w-4 ms-4 me-2 text-muted-foreground"/>
      </CardHeader>
      <CardContent class="flex items-center justify-center">
        <IconCheck class="flex-shrink-0 size-8 text-green-600"/>
      </CardContent>
    </Card>
  </div>
  <!-- End Display Profile Infos -->

  <!-- Groups display/creation -->
  <div class="m-4 flex flex-col gap-y-6 justify-start max-w-screen-2xl lg:max-w-[80vw]">
    <Separator class="bg-aruna-text/50"/>
    <h2 class="text-2xl font-bold text-aruna-text-accent">
      Your groups
    </h2>
    <Table>
      <TableCaption class="">A list of the groups you are member of</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead class="text-lg">Id</TableHead>
          <TableHead class="text-lg">Name</TableHead>
          <TableHead class="text-lg">Description</TableHead>
          <TableHead class="text-lg">PermissionLevel</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="group in groups" :key="group.group.name">
          <TableCell class="font-medium">
            {{ group.group.id }}
          </TableCell>
          <TableCell>{{ group.group.name }}</TableCell>
          <TableCell>{{ group.group.description ? displayDescription(group.group.description, 128) : 'N/A' }}
          </TableCell>
          <TableCell>{{ group.permission }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <GroupDialog :initial-open="false"
                 :with-button="true"
                 @add-group="v => console.log('[Profile] Received Add Group Event:', v.group.id)"/>
  </div>
  <!-- End Groups display/creation -->

</template>