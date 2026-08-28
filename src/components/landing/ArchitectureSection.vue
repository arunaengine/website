<script setup lang="ts">
import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { Hash, FileJson2, Database, Share2, Layers } from '@lucide/vue'
</script>

<template>
  <section id="architecture" class="section bg-muted/30">
    <div class="container max-w-6xl">
      <SectionHeader
        eyebrow="Architecture"
        title="How a realm is put together."
        description="Cooperating organizations each run a node. Nodes replicate datasets to one another, so the catalog needs no central node."
      />

      <div class="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
        <dl class="flex flex-col gap-6">
          <div class="flex gap-4">
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
          <Card class="overflow-hidden p-0">
            <div class="bg-[#0B0B0E] p-5 text-[#F1F3F8]">
              <div class="flex items-center justify-between text-xs text-[#8891A8]">
                <span class="font-mono">/{realm}/g/{group}/meta/alpine-basin</span>
                <span class="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[#55C4DE]">
                  RO-Crate v1.2
                </span>
              </div>
              <pre
                class="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#C7CCDA] scrollbar-thin"
              ><code>{
  "@context": "https://w3id.org/ro/crate/1.2/context",
  "@graph": [
    {
      "@id": "ro-crate-metadata.json",
      "@type": "CreativeWork",
      "conformsTo": { "@id": "https://w3id.org/ro/crate/1.2" },
      "about": { "@id": "./" }
    },
    {
      "@id": "./",
      "@type": "Dataset",
      "name": "Alpine Basin Reanalysis",
      "description": "Daily temperature and precipitation fields for the alpine basin study area, 1979 to 2024.",
      "datePublished": "2026-04-02",
      "license": { "@id": "https://creativecommons.org/licenses/by/4.0/" },
      "hasPart": [
        { "@id": "data/temperature.nc" },
        { "@id": "data/precipitation.nc" }
      ]
    },
    {
      "@id": "data/temperature.nc",
      "@type": "File",
      "name": "Daily mean temperature",
      "encodingFormat": "application/x-netcdf"
    },
    {
      "@id": "data/precipitation.nc",
      "@type": "File",
      "name": "Daily precipitation totals",
      "encodingFormat": "application/x-netcdf"
    }
  ]
}</code></pre>
            </div>
            <div class="grid grid-cols-2 divide-x divide-border border-t border-border bg-muted/30 text-xs">
              <div class="flex items-center gap-2 px-5 py-3">
                <Share2 class="h-3.5 w-3.5 text-primary" />
                <span class="text-foreground/80">replicated to 3 nodes</span>
              </div>
              <div class="flex items-center gap-2 px-5 py-3">
                <Layers class="h-3.5 w-3.5 text-primary" />
                <span class="text-foreground/80">referenced in 2 buckets</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </section>
</template>
