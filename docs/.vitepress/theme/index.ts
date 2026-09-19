import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import IntroVideo from './IntroVideo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('IntroVideo', IntroVideo);
  }
} satisfies Theme;
