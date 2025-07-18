<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

//console.log(window.location.hostname)
const local = computed(() => window.location.hostname.includes('localhost'))
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button variant="outline"
              class="px-3 py-2 border-aruna-text-accent bg-transparent hover:bg-transparent">
        Login
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-xs border-aruna-text/50 bg-aruna-bg/90">
      <DialogHeader>
        <DialogTitle class="text-center">Continue login with</DialogTitle>
        <Separator class="my-2 bg-aruna-highlight"/>
      </DialogHeader>

      <Button v-if='local'
              variant="outline"
              class="px-4 border-aruna-text/50 text-lg hover:bg-aruna-fg">
        <a href="/auth/login?provider=local" class="flex items-center">
          <img src="/imgs/keycloak.webp"
               alt="Local Test Login"
               class="flex h-6 mr-3"/>
          <p class="flex">Local Test Login</p>
        </a>
      </Button>

      <Button variant="outline"
              class="px-4 border-aruna-text/50 text-lg hover:bg-aruna-fg">
        <a href="/auth/login?provider=lifescience" class="flex items-center">
          <img src="/imgs/ls-ri.webp"
               alt="LifeScience Login"
               class="h-6 mr-2"/>
          LifeScience RI
        </a>
      </Button>

      <Button variant="outline"
              class="px-4 border-aruna-text/50 text-lg hover:bg-aruna-fg">
        <a href="/auth/login?provider=gfbio" class="flex items-center">
          <img src="/imgs/gfbio.webp"
               alt="GFBio Logo"
               class="h-6 mr-2"/>
          GFBio SSO
        </a>
      </Button>

      <Button variant="outline"
              class="px-4 border-aruna-text/50 text-lg hover:bg-aruna-fg">
        <a href="/auth/login?provider=iam4nfdi" class="flex items-center">
          <img src="/imgs/iam4nfdi.webp"
               alt="IAM4NFDI Logo"
               class="h-6 mr-2"/>
          NFDI AAI
        </a>
      </Button>
    </DialogContent>
  </Dialog>
</template>