<script setup lang="ts">
// The "Where your data lives" figure, drawn inline so it takes the page theme:
// text is currentColor under the foreground classes, strokes and markers use
// the brand palette, and nothing paints a background.
</script>

<template>
  <svg
    viewBox="0 0 760 330"
    role="img"
    aria-label="An upload goes through a storage backend to a copy, a placement policy allows or refuses that copy, and a bucket sync writes a second bucket on another node"
    class="h-auto w-full font-sans"
  >
    <title>How an upload becomes copies</title>
    <!-- Marker contents inherit from the marker's own ancestors, so each colour has its own group. -->
    <g class="text-primary">
      <defs>
        <marker id="wdl-arrow-primary" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </g>
    <g class="text-aruna-tagline">
      <defs>
        <marker id="wdl-arrow-tagline" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </g>
    <g class="text-aruna-sky">
      <defs>
        <marker id="wdl-arrow-sky" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
    </g>

    <g fill="currentColor" class="text-foreground">
      <text x="32" y="34" font-size="15" font-weight="600">One node: an upload becomes a copy</text>

      <rect x="32" y="58" width="150" height="58" rx="10" class="fill-primary/10 stroke-primary" stroke-width="1.5" />
      <text x="107" y="83" font-size="13" font-weight="600" text-anchor="middle">Bucket</text>
      <text x="107" y="101" font-size="11" text-anchor="middle" class="text-muted-foreground">an upload arrives</text>

      <line x1="190" y1="87" x2="248" y2="87" class="stroke-primary" stroke-width="1.5" marker-end="url(#wdl-arrow-primary)" />

      <rect x="256" y="58" width="176" height="58" rx="10" class="fill-primary/10 stroke-primary" stroke-width="1.5" />
      <text x="344" y="83" font-size="13" font-weight="600" text-anchor="middle">Storage backend</text>
      <text x="344" y="101" font-size="11" text-anchor="middle" class="text-muted-foreground">on this node</text>

      <line x1="440" y1="87" x2="498" y2="87" class="stroke-primary" stroke-width="1.5" marker-end="url(#wdl-arrow-primary)" />

      <rect x="506" y="58" width="222" height="58" rx="10" class="fill-aruna-sky/15 stroke-aruna-sky" stroke-width="1.5" />
      <text x="617" y="83" font-size="13" font-weight="600" text-anchor="middle">Copy, in Storage locations</text>
      <text x="617" y="101" font-size="11" text-anchor="middle" class="text-muted-foreground">state present, pending or unreachable</text>

      <line x1="344" y1="152" x2="344" y2="124" class="stroke-aruna-tagline" stroke-width="1.5" stroke-dasharray="4 4" marker-end="url(#wdl-arrow-tagline)" />
      <rect x="204" y="152" width="280" height="50" rx="10" fill="none" class="stroke-aruna-tagline" stroke-width="1.5" stroke-dasharray="4 4" />
      <text x="344" y="172" font-size="12" font-weight="600" text-anchor="middle">Placement policy</text>
      <text x="344" y="190" font-size="11" text-anchor="middle" class="text-muted-foreground">allows or refuses; it never adds a copy</text>

      <text x="32" y="248" font-size="15" font-weight="600">Two buckets: a sync writes a second one</text>

      <rect x="32" y="266" width="176" height="46" rx="10" class="fill-primary/10 stroke-primary" stroke-width="1.5" />
      <text x="120" y="294" font-size="13" font-weight="600" text-anchor="middle">Bucket A</text>

      <line x1="216" y1="289" x2="322" y2="289" class="stroke-aruna-sky" stroke-width="1.5" marker-end="url(#wdl-arrow-sky)" />
      <text x="269" y="281" font-size="11" text-anchor="middle" class="text-aruna-sky">sync</text>

      <rect x="330" y="266" width="398" height="46" rx="10" class="fill-aruna-sky/15 stroke-aruna-sky" stroke-width="1.5" />
      <text x="529" y="288" font-size="13" font-weight="600" text-anchor="middle">Bucket B on another node</text>
      <text x="529" y="304" font-size="11" text-anchor="middle" class="text-muted-foreground">the target owns its copy and serves it under its own name</text>
    </g>
  </svg>
</template>
