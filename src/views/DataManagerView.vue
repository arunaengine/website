<script setup lang="ts">
import PageHeader from '@/components/dashboard/PageHeader.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'
import { useAruna } from '@/composables/useAruna'
import { Boxes, RefreshCw, Server, ShieldAlert } from 'lucide-vue-next'

const { realmInfo, nodeInfo, refresh } = useAruna()
</script>

<template>
  <div>
    <PageHeader
      title="Buckets"
      description="Live S3 interface status. Object browsing is intentionally disabled until Aruna exposes browser-safe S3 listing."
    >
      <template #actions>
        <Button variant="outline" @click="refresh"><RefreshCw class="h-4 w-4" /> Refresh</Button>
      </template>
    </PageHeader>

    <div class="container max-w-[1000px] space-y-6 py-8">
      <section class="surface p-6">
        <div class="flex items-start gap-4">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Boxes class="h-6 w-6" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-lg font-semibold text-aruna-navy">S3 object browser unavailable</h2>
              <Badge variant="warn">unsupported</Badge>
            </div>
            <p class="mt-2 text-sm text-muted-foreground">
              This UI no longer shows demo buckets or files. Aruna’s REST API does not provide object listing, and the browser S3 path is deferred until S3 ListObjectsV2 and CORS are implemented.
            </p>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
        <div class="surface p-5">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Server class="h-4 w-4 text-primary" /> REST interface
          </div>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-muted-foreground">Status</dt><dd class="font-mono">{{ realmInfo?.interfaces.rest.status ?? nodeInfo?.services.interfaces.rest.status ?? 'unknown' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-muted-foreground">URL</dt><dd class="break-all text-right font-mono text-xs">{{ realmInfo?.interfaces.rest.url ?? nodeInfo?.services.interfaces.rest.url ?? 'not advertised' }}</dd></div>
          </dl>
        </div>
        <div class="surface p-5">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Server class="h-4 w-4 text-primary" /> S3 interface
          </div>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-muted-foreground">Status</dt><dd class="font-mono">{{ realmInfo?.interfaces.s3.status ?? nodeInfo?.services.interfaces.s3.status ?? 'unknown' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-muted-foreground">URL</dt><dd class="break-all text-right font-mono text-xs">{{ realmInfo?.interfaces.s3.url ?? nodeInfo?.services.interfaces.s3.url ?? 'not advertised' }}</dd></div>
          </dl>
        </div>
      </section>

      <section class="surface border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-900 dark:text-amber-200">
        <div class="flex items-start gap-3">
          <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Use an S3 client directly against the advertised S3 URL for now. The web UI will enable object listing only after the backend supports the required browser S3 operations.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
