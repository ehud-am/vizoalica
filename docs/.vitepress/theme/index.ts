import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import AnalyticsConsent from './AnalyticsConsent.vue';
import IntroVideo from './IntroVideo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'layout-bottom': () => h(AnalyticsConsent) }),
  enhanceApp({ app }) {
    app.component('IntroVideo', IntroVideo);
  }
} satisfies Theme;
