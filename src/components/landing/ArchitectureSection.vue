<script setup lang="ts">
import Card from '@/components/ui/Card.vue'
import FederationGraph from '@/components/landing/FederationGraph.vue'
import { Hash, FileJson2, Database, Layers } from '@lucide/vue'
</script>

<template>
  <section id="architecture" class="section bg-muted/30">
    <div class="container max-w-5xl">
      <div class="mx-auto max-w-2xl text-center">
        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Architecture</div>
        <h2 class="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-aruna-navy sm:text-4xl">
          How a realm is put together.
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          Cooperating organizations each run a node. Nodes replicate datasets to one another, so the catalog needs no central node.
        </p>
      </div>

      <div class="mt-12 grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <dl class="flex flex-col gap-6">
          <div class="flex gap-4">
            <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hash class="h-5 w-5" />
            </div>
            <div>
              <dt class="font-display text-base font-semibold text-aruna-navy">
                Content-addressed objects
              </dt>
              <dd class="mt-1 text-sm text-muted-foreground">
                Files are stored as immutable blobs identified by their BLAKE3
                hash. Identical content is stored once, and transfers between
                nodes are verified against the hash as they stream.
              </dd>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileJson2 class="h-5 w-5" />
            </div>
            <div>
              <dt class="font-display text-base font-semibold text-aruna-navy">
                Datasets with history
              </dt>
              <dd class="mt-1 text-sm text-muted-foreground">
                Each dataset carries a stable identifier of its own. Changes
                are recorded as ordered events, which gives every dataset an
                append-only audit log.
              </dd>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database class="h-5 w-5" />
            </div>
            <div>
              <dt class="font-display text-base font-semibold text-aruna-navy">
                Buckets as virtual collections
              </dt>
              <dd class="mt-1 text-sm text-muted-foreground">
                A bucket can mix local objects, replicated copies and
                references to objects on other nodes. Through the S3 API it
                looks like one ordinary bucket.
              </dd>
            </div>
          </div>
          <div class="flex gap-4">
            <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers class="h-5 w-5" />
            </div>
            <div>
              <dt class="font-display text-base font-semibold text-aruna-navy">
                Realms and groups on top
              </dt>
              <dd class="mt-1 text-sm text-muted-foreground">
                A realm is the trust boundary that nodes join. Within it,
                groups hold users and roles, and roles grant permissions on
                paths. Trust between organizations never implies access.
              </dd>
            </div>
          </div>
        </dl>

        <div class="relative">
          <Card class="relative overflow-hidden p-4 sm:p-6">
            <div
              aria-hidden="true"
              class="grid-faint pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_50%,black_30%,transparent_72%)]"
            />
            <FederationGraph />
          </Card>
          <p class="mt-3 text-xs text-muted-foreground">
            Three peers, no central node: a job travels to the dataset, data travels to compute, and results come back.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
