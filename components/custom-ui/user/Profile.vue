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
import type {Group} from "~/composables/api_wrapper";

interface ProfileProps {
  userId?: string,
  displayName?: string,
  email?: string,
  isActive?: boolean,
  groups: Group[]
}
const {userId, displayName, email, isActive} = defineProps<ProfileProps>()
</script>/
<template>
    <div class="m-4 pb-6 flex flex-col lg:flex-row flex-wrap justify-start gap-x-6 gap-y-6 border-b border-aruna-text/50">
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
              {{ userId }}
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
            {{ displayName }}
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
            {{ email ? email : 'No email provided' }}
          </div>
        </CardContent>
      </Card>

      <Card class="">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-lg font-medium">
            Active
          </CardTitle>
          <IconUserCheck v-if="isActive" class="h-4 w-4 ms-4 me-2 text-muted-foreground"/>
          <IconUserCancel v-else class="h-4 w-4 ms-4 me-2 text-muted-foreground"/>
        </CardHeader>
        <CardContent class="flex items-center justify-center">
          <IconCheck v-if="isActive"
                     class="flex-shrink-0 size-8 text-green-600"/>
          <IconX v-else
                 class="flex-shrink-0 text-red-600"/>
        </CardContent>
      </Card>
    </div>


  <!--  -->
</template>