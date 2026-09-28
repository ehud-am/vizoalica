<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';

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
      :poster="withBase('/media/vizoalica-mcp-demo-poster.jpg')"
      aria-label="Claude Code answering two questions about a website's traffic through the Vizoalica MCP server, on fictional demo data"
    >
      <source :src="withBase('/media/vizoalica-mcp-demo.webm')" type="video/webm" />
      <source :src="withBase('/media/vizoalica-mcp-demo.mp4')" type="video/mp4" />
      <p>
        Your browser cannot play this video.
        <a :href="withBase('/media/vizoalica-mcp-demo.mp4')">Download it</a>.
      </p>
    </video>
    <figcaption>
      A real Claude Code session using <code>vizoalica mcp</code>, recorded on fictional demo data.
      <details>
        <summary>Read the video’s text</summary>
        <ol>
          <li>
            “How did my websites do last week?” Claude lists the environments and websites, compares
            the last 7 days with the week before, and reads each website’s overview. It answers:
            24,163 page views (+45.5%), driven by a Hacker News spike on the marketing site; the
            documentation steady; the blog down.
          </li>
          <li>
            “Why did traffic to the blog drop?” Claude compares the blog with the week before and
            finds page views fell from 3,387 to 2,228 (−34.2%), most likely because a newsletter
            referrer that sent 1,138 views the week before stopped, while search referrers stayed
            flat.
          </li>
        </ol>
      </details>
    </figcaption>
  </figure>
</template>
