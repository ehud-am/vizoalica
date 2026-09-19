<script setup lang="ts">
import { onMounted, ref } from 'vue';

const video = ref<HTMLVideoElement>();

onMounted(() => {
  // Muted autoplay, with controls to pause it, only for visitors who have not asked for less
  // motion. Everyone else sees the poster and chooses to play.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    video.value?.play().catch(() => undefined);
});
</script>

<template>
  <figure class="intro-video">
    <video
      ref="video"
      controls
      muted
      playsinline
      preload="metadata"
      poster="/media/vizoalica-intro-poster.jpg"
      aria-label="Vizoalica in 13 seconds: key messages typed over the console"
    >
      <source src="/media/vizoalica-intro.webm" type="video/webm" />
      <source src="/media/vizoalica-intro.mp4" type="video/mp4" />
      <p>
        Your browser cannot play this video. <a href="/media/vizoalica-intro.mp4">Download it</a>.
      </p>
    </video>
    <figcaption>
      <details>
        <summary>Read the video’s text</summary>
        <ol>
          <li>Privacy-first web analytics.</li>
          <li>On your own Cloudflare account.</li>
          <li><code>pnpm vizoalica install</code></li>
          <li>
            vizoalica.dev: open-source, self-hosted web analytics on your own Cloudflare account.
          </li>
        </ol>
      </details>
    </figcaption>
  </figure>
</template>
