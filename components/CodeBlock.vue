<script setup lang="ts">
import { Copy, Check, ChevronDown, LoaderCircle } from '@lucide/vue';
import {
  COMMON_LANGUAGES,
  LAZY_LANGUAGES,
  ensureLanguage,
  highlightCode,
  normalizeLanguage,
  registryVersion,
} from '~/composables/useHighlighter';

const props = defineProps<{ code: string; lang: string }>();

const authored = computed(() => normalizeLanguage(props.lang));

// `selectValue` is what the <select> shows and updates the moment the reader
// picks; `activeLang` is what we highlight with and only moves once the grammar
// is registered. Keeping them apart means a failed lazy load can put the
// control back without ever having repainted the code.
const selectValue = ref(authored.value);
const activeLang = ref(authored.value);
const pending = ref(false);
const loadFailed = ref('');

// The editor preview re-renders on every keystroke and Vue reuses these
// instances, so a block whose fence tag changed must drop the old selection.
watch(authored, (next) => {
  selectValue.value = next;
  activeLang.value = next;
  loadFailed.value = '';
});

const highlighted = computed(() => {
  void registryVersion.value; // recompute once a lazily loaded grammar lands
  return highlightCode(props.code, activeLang.value);
});

async function onLanguageChange() {
  // v-model has already written the pick into selectValue.
  const next = selectValue.value;
  const previous = activeLang.value;
  if (next === previous) return;

  loadFailed.value = '';
  pending.value = true;

  const ready = await ensureLanguage(next);

  pending.value = false;
  if (ready) {
    activeLang.value = next;
  } else {
    // Reverting the ref is what patches the native control back; leaving it
    // alone would strand the <select> showing a language we never applied.
    selectValue.value = previous;
    loadFailed.value = next;
  }
}

type CopyState = 'idle' | 'copied' | 'failed';
const copyState = ref<CopyState>('idle');
let copyTimer: ReturnType<typeof setTimeout> | undefined;

/** execCommand fallback: clipboard.writeText needs a secure context. */
function copyViaTextarea(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

async function copyCode() {
  // Always the raw source - never the highlighted markup, never the label.
  const text = props.code;
  let ok = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    } else {
      ok = copyViaTextarea(text);
    }
  } catch {
    ok = copyViaTextarea(text);
  }

  copyState.value = ok ? 'copied' : 'failed';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => (copyState.value = 'idle'), 2000);
}

onBeforeUnmount(() => clearTimeout(copyTimer));

const copyLabel = computed(
  () => ({ idle: 'Copy', copied: 'Copied', failed: 'Failed' })[copyState.value]
);
</script>

<template>
  <div class="code-block">
    <div class="code-block-header">
      <div class="code-lang">
        <!-- v-model rather than :value so SSR marks the matching <option
             selected>. A plain value attribute on <select> is ignored by the
             browser, which showed the first option until hydration ran. -->
        <select
          v-model="selectValue"
          class="code-lang-select"
          aria-label="Code language"
          :disabled="pending"
          @change="onLanguageChange"
        >
          <optgroup label="Common">
            <option v-for="name in COMMON_LANGUAGES" :key="name" :value="name">{{ name }}</option>
          </optgroup>
          <optgroup label="All languages">
            <option v-for="name in LAZY_LANGUAGES" :key="name" :value="name">{{ name }}</option>
          </optgroup>
        </select>
        <LoaderCircle v-if="pending" :size="13" class="code-spinner" />
        <ChevronDown v-else :size="13" class="code-chevron" />
      </div>

      <div class="code-header-right">
        <span v-if="loadFailed" class="code-error" role="status">
          Could not load {{ loadFailed }}
        </span>
        <button
          type="button"
          class="code-copy"
          :class="{ ok: copyState === 'copied', bad: copyState === 'failed' }"
          :aria-label="`Copy code to clipboard`"
          @click="copyCode"
        >
          <component :is="copyState === 'copied' ? Check : Copy" :size="13" />
          <span>{{ copyLabel }}</span>
        </button>
      </div>
    </div>

    <pre><code class="hljs" v-html="highlighted" /></pre>
  </div>
</template>

<style scoped>
.code-block {
  margin: 1em 0;
  border: 1px solid #30363d;
  border-radius: var(--radius);
  background: #0d1117;
  overflow: hidden;
}
.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px 4px 8px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}
.code-lang {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: #8b949e;
}
.code-lang-select {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #8b949e;
  font-family: var(--mono);
  font-size: 12px;
  padding: 2px 20px 2px 6px;
  cursor: pointer;
  max-width: 180px;
}
.code-lang-select:hover:not(:disabled) {
  border-color: #30363d;
  color: #e6edf3;
}
.code-lang-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.code-lang-select:disabled {
  cursor: progress;
}
/* The native menu inherits the dark control colour on some platforms. */
.code-lang-select option,
.code-lang-select optgroup {
  background: #161b22;
  color: #e6edf3;
}
.code-chevron,
.code-spinner {
  position: absolute;
  right: 4px;
  pointer-events: none;
}
.code-spinner {
  animation: code-spin 0.8s linear infinite;
}
@keyframes code-spin {
  to {
    transform: rotate(360deg);
  }
}
.code-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.code-error {
  font-size: 11px;
  color: #ffa657;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.code-copy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #8b949e;
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;
}
.code-copy:hover {
  color: #e6edf3;
  border-color: #8b949e;
}
.code-copy:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.code-copy.ok {
  color: #3fb950;
  border-color: #3fb950;
}
.code-copy.bad {
  color: #f85149;
  border-color: #f85149;
}
.code-block pre {
  margin: 0;
  padding: 14px 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #e6edf3;
  overflow-x: auto;
}
.code-block code {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--mono);
  font-size: 0.88em;
}

@media (max-width: 640px) {
  .code-error {
    display: none;
  }
}
</style>
