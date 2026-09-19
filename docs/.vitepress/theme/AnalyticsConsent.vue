<script setup lang="ts">
import { onMounted, ref } from 'vue';

// Set at build time (see config.mts): false unless the site is being built for a Vizoalica
// backend, in which case this component renders nothing and loads nothing.
declare const __VIZOALICA_ANALYTICS__: boolean;

const KEY = 'vizoalica-docs-analytics';
type Choice = 'granted' | 'denied';

const enabled = __VIZOALICA_ANALYTICS__;
const choice = ref<Choice | undefined>();
const asking = ref(false);
const privacySignal = ref(false);
const heading = ref<HTMLElement>();

function stored(): Choice | undefined {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : undefined;
  } catch {
    return undefined;
  }
}

function load(): void {
  if (document.querySelector('script[data-vizoalica-loader]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = '/vizoalica-loader.js';
  script.dataset.vizoalicaLoader = '';
  document.head.append(script);
}

function decide(next: Choice): void {
  const was = choice.value;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Not remembering the choice is acceptable: the visitor is asked again next time.
  }
  choice.value = next;
  asking.value = false;
  if (next === 'granted') load();
  // The measuring script cannot be unloaded, so withdrawing consent reloads the page without it.
  else if (was === 'granted') window.location.reload();
}

function reopen(): void {
  asking.value = true;
  requestAnimationFrame(() => heading.value?.focus());
}

onMounted(() => {
  if (!enabled) return;
  // A browser that says "do not track" or sends Global Privacy Control has already answered.
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true || navigator.doNotTrack === '1') {
    privacySignal.value = true;
    choice.value = 'denied';
    return;
  }
  choice.value = stored();
  if (choice.value === 'granted') load();
  else if (choice.value === undefined) asking.value = true;
});
</script>

<template>
  <div v-if="enabled" class="analytics-consent">
    <section v-if="asking" class="analytics-card" aria-labelledby="analytics-consent-title">
      <h2 id="analytics-consent-title" ref="heading" tabindex="-1">Help improve these docs?</h2>
      <p>
        We would like to count page views with Vizoalica, the open-source analytics this site
        documents. It sets no cookies and stores no personal data, and it stays off unless you allow
        it.
        <a href="/operations/privacy">How Vizoalica handles privacy</a>
      </p>
      <div class="analytics-actions">
        <button type="button" class="allow" @click="decide('granted')">Allow analytics</button>
        <button type="button" @click="decide('denied')">No thanks</button>
      </div>
    </section>
    <button
      v-else-if="choice !== undefined && !privacySignal"
      type="button"
      class="analytics-reopen"
      @click="reopen"
    >
      Analytics: {{ choice === 'granted' ? 'on' : 'off' }}. Change
    </button>
  </div>
</template>

<style scoped>
.analytics-consent {
  position: fixed;
  z-index: 60;
  right: 16px;
  bottom: 16px;
  max-width: calc(100vw - 32px);
  font-size: 14px;
  line-height: 1.5;
}
.analytics-card {
  width: 360px;
  max-width: 100%;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  box-shadow: var(--vp-shadow-3);
}
.analytics-card h2 {
  margin: 0 0 8px;
  padding: 0;
  border: 0;
  font-size: 16px;
  line-height: 1.4;
}
.analytics-card p {
  margin: 0 0 12px;
  color: var(--vp-c-text-2);
}
.analytics-actions {
  display: flex;
  gap: 8px;
}
button {
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font: inherit;
  cursor: pointer;
}
button.allow {
  border-color: var(--vp-button-brand-bg);
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}
.analytics-reopen {
  padding: 4px 10px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}
</style>
