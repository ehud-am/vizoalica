import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import AnalyticsConsent from './AnalyticsConsent.vue';
import IntroVideo from './IntroVideo.vue';
import HeroShots from './HeroShots.vue';
import McpDemoVideo from './McpDemoVideo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-after': () => h(HeroShots),
      'layout-bottom': () => h(AnalyticsConsent)
    }),
  enhanceApp({ app }) {
    app.component('IntroVideo', IntroVideo);
    app.component('McpDemoVideo', McpDemoVideo);
  }
} satisfies Theme;
