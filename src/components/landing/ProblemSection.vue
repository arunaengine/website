<script setup lang="ts">
import { CopyX, Files, Unlink } from '@lucide/vue'
</script>

<template>
  <section id="why" class="s25 frag">
    <div class="wrap frag-g">
      <div class="frag-t">
        <p class="eb">The problem</p>
        <h2>Research data is often fragmented</h2>
        <ul class="frag-p">
          <li>
            <Files /><span><b>Files and descriptions sit in many systems</b><small class="t-l">Instruments, lab disks, clusters, clouds and repositories each keep a part of your data.</small></span>
          </li>
          <li>
            <CopyX /><span><b>Hand-made copies drift apart</b><small class="t-l">Every partner keeps a version, and nobody knows which one is current.</small></span>
          </li>
          <li>
            <Unlink /><span><b>Links between data, analyses and results get lost</b><small class="t-l">Months later, nobody can say which run produced a figure.</small></span>
          </li>
        </ul>
        <p class="frag-a">A big central storage only turns this into one larger silo. Aruna connects the ones you already have.</p>
      </div>
      <figure class="frag-v">
        <svg class="frag-s" viewBox="100 205 1300 680" role="img" aria-label="Data from four sources copied by hand into four places">
          <defs>
            <marker id="fa" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" markerUnits="strokeWidth" orient="auto-start-reverse">
              <path d="M2 2 L10 6 L2 10" fill="none" stroke="#99a2b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </marker>
          </defs>
          <g>
            <path class="manual" style="stroke-width:4;stroke-dasharray:18 11" d="M492 300 C620 300 700 440 892 440" />
            <path class="manual" style="stroke-width:4;stroke-dasharray:18 11" d="M492 450 C680 450 640 575 892 575" />
            <path class="manual" style="stroke-width:4;stroke-dasharray:18 11" d="M492 720 C620 720 720 460 892 460" />
          </g>
          <g>
            <path class="manual" style="stroke-dasharray:.1 13;stroke-width:6.5" d="M492 330 C720 330 620 305 892 305" />
            <path class="manual" style="stroke-dasharray:.1 13;stroke-width:6.5" d="M492 585 C640 585 700 325 892 325" />
            <path class="manual" style="stroke-dasharray:.1 13;stroke-width:6.5" d="M492 600 C700 600 640 710 892 710" />
          </g>
          <g>
            <text class="rl" x="120" y="240">Where data is made</text>
            <g transform="translate(120 264) scale(1)">
              <rect class="il t1" x="8" y="18" width="114" height="70" rx="12" />
              <rect class="il t2" x="20" y="30" width="54" height="30" rx="5" />
              <path class="il-al" d="M27 51 C34 37 41 37 47 45 C53 53 60 53 67 39" />
              <rect class="il b0" x="82" y="32" width="28" height="9" rx="3" />
              <circle class="il-a" cx="88" cy="58" r="4.5" />
              <circle class="il-a" cx="102" cy="58" r="4.5" opacity=".55" />
              <path class="il no" d="M24 96 H106" />
            </g>
            <text class="lb" x="270" y="323">Sequencing</text>
            <g transform="translate(120 399) scale(1)">
              <rect class="il g1" x="8" y="64" width="114" height="16" rx="4" />
              <rect class="il b0" x="20" y="14" width="16" height="62" rx="8" />
              <path class="il-a" d="M22.5 46 H33.5 V68 a5.5 5.5 0 0 1 -11 0 Z" />
              <rect class="il b0" x="45" y="14" width="16" height="62" rx="8" />
              <path class="il t2" d="M47.5 46 H58.5 V68 a5.5 5.5 0 0 1 -11 0 Z" />
              <rect class="il b0" x="70" y="14" width="16" height="62" rx="8" />
              <path class="il-a" d="M72.5 46 H83.5 V68 a5.5 5.5 0 0 1 -11 0 Z" />
              <rect class="il b0" x="95" y="14" width="16" height="62" rx="8" />
              <path class="il t2" d="M97.5 46 H108.5 V68 a5.5 5.5 0 0 1 -11 0 Z" />
              <path class="il no" d="M14 92 H116" />
            </g>
            <text class="lb" x="270" y="458">Lab assays</text>
            <g transform="translate(120 534) scale(1)">
              <rect class="il b0" x="26" y="12" width="70" height="84" rx="8" />
              <rect class="il t2" x="44" y="5" width="34" height="15" rx="5" />
              <path class="il-al" d="M38 38 l5 5 l9 -10" />
              <path class="il no" d="M60 39 H84 M38 56 H84 M38 72 H72" />
              <path class="il t1" d="M96 50 L112 34 L120 42 L104 58 L94 61 Z" />
            </g>
            <text class="lb" x="270" y="593">Manual curation</text>
            <g transform="translate(120 669) scale(1)">
              <rect class="il g1" x="22" y="82" width="86" height="12" rx="5" />
              <path class="il t1" d="M84 82 V44 C84 30 74 22 62 20 L58 30 C66 32 72 36 72 44 V82 Z" />
              <rect class="il t2" x="30" y="14" width="18" height="50" rx="5" transform="rotate(-28 39 39)" />
              <rect class="il b0" x="36" y="62" width="44" height="9" rx="3" />
              <circle class="il-a" cx="58" cy="58" r="4" />
            </g>
            <text class="lb" x="270" y="728">Instruments</text>
          </g>
          <g>
            <text class="rl" x="900" y="240">Where it ends up</text>
            <g transform="translate(900 264) scale(1)">
              <rect class="il t1" x="6" y="16" width="66" height="76" rx="7" />
              <path class="il no" d="M18 16 V92 M28 34 H62 M28 48 H62 M28 62 H52" />
              <rect class="il g1" x="68" y="50" width="56" height="42" rx="7" />
              <circle class="il-a" cx="112" cy="80" r="4" />
              <path class="il no" d="M78 62 H106" />
            </g>
            <text class="lb sm" x="1046" y="308">Lab notebooks</text>
            <text class="sl" x="1046" y="342">and local disks</text>
            <g transform="translate(900 399) scale(1)">
              <rect class="il b0" x="30" y="6" width="72" height="90" rx="8" />
              <rect class="il t1" x="38" y="16" width="56" height="20" rx="4" />
              <circle class="il-a" cx="84" cy="26" r="3.5" />
              <path class="il no" d="M46 26 H66" />
              <rect class="il t1" x="38" y="42" width="56" height="20" rx="4" />
              <circle class="il-a" cx="84" cy="52" r="3.5" />
              <path class="il no" d="M46 52 H66" />
              <rect class="il t1" x="38" y="68" width="56" height="20" rx="4" />
              <circle class="il-a" cx="84" cy="78" r="3.5" />
              <path class="il no" d="M46 78 H66" />
            </g>
            <text class="lb sm" x="1046" y="443">Compute clusters (HPC)</text>
            <text class="sl" x="1046" y="477">and file servers</text>
            <g transform="translate(900 534) scale(1)">
              <path class="il t1" d="M30 82 C12 82 6 62 20 54 C16 34 40 26 50 40 C58 18 94 20 96 46 C114 44 124 62 114 74 C110 80 104 82 98 82 Z" />
              <path class="il-al" d="M44 66 H86" />
            </g>
            <text class="lb sm" x="1046" y="578">Cloud</text>
            <text class="sl" x="1046" y="612">Object storage</text>
            <g transform="translate(900 669) scale(1)">
              <path class="il t1" d="M24 64 v18 a41 11 0 0 0 82 0 v-18" />
              <ellipse class="il t1" cx="65" cy="64" rx="41" ry="11" />
              <path class="il t1" d="M24 42 v18 a41 11 0 0 0 82 0 v-18" />
              <ellipse class="il t1" cx="65" cy="42" rx="41" ry="11" />
              <path class="il t2" d="M24 20 v18 a41 11 0 0 0 82 0 v-18" />
              <ellipse class="il t2" cx="65" cy="20" rx="41" ry="11" />
            </g>
            <text class="lb sm" x="1046" y="713">Repositories</text>
            <text class="sl" x="1046" y="747">NCBI, ENA, …</text>
          </g>
          <g class="fl-key">
            <path class="manual" style="stroke-width:4;stroke-dasharray:18 11" d="M120 850 H200" />
            <text class="sl" x="214" y="858">Files</text>
            <path class="manual" style="stroke-dasharray:.1 13;stroke-width:6.5" d="M330 850 H410" />
            <text class="sl" x="424" y="858">Descriptions</text>
          </g>
        </svg>
      </figure>
    </div>
  </section>
</template>
