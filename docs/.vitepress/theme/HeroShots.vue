<script setup lang="ts">
// Shown right under the hero, before the feature cards: what it looks like, and who it is for.
import answer from '../../assets/mcp-answer.png';
import overview from '../../assets/console-overview-light.png';
</script>

<template>
  <div class="hero-after">
    <div class="hero-shots">
      <figure>
        <img
          :src="answer"
          alt="Claude Code answering “Why did traffic to the blog drop?” with numbers from the Vizoalica MCP server: page views fell 34%, most likely because a newsletter referrer stopped"
          width="1200"
          height="596"
        />
        <figcaption>Your assistant answers from your own data (fictional demo data).</figcaption>
      </figure>
      <figure>
        <img
          :src="overview"
          alt="The Vizoalica console overview: page views and unique visitors over time, top pages, referrers, and countries, on sample data"
        />
        <figcaption>The console, on your computer (sample data).</figcaption>
      </figure>
    </div>

    <div class="fit-box" role="note" aria-label="Is this for you?">
      <div>
        <p class="fit-title">A good fit if you</p>
        <ul>
          <li>have a Cloudflare account, or are happy to create a free one;</li>
          <li>are comfortable running a few commands in a terminal;</li>
          <li>want your analytics in your own account, and your AI assistant able to read them.</li>
        </ul>
      </div>
      <div>
        <p class="fit-title">Not yet if you need</p>
        <ul>
          <li>setup without a terminal, such as a WordPress plugin;</li>
          <li>a dashboard you can open from your phone or share by link;</li>
          <li>Windows without WSL, goals and funnels, or UTM campaign reports.</li>
        </ul>
      </div>
    </div>
  </div>
</template>
