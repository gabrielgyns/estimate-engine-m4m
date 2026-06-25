<script setup lang="ts">
import { computed } from "vue";
import type { ActionState } from "../lib/useAction";

const props = defineProps<{ state: ActionState }>();

const pretty = computed(() => {
  const { data, error } = props.state;
  const payload = error ?? data;
  if (payload === null || payload === undefined) {
    return "";
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
});

const status = computed(() => {
  if (props.state.loading) {
    return "loading";
  }
  if (props.state.error) {
    return "error";
  }
  if (props.state.data !== null) {
    return "ok";
  }
  return "idle";
});
</script>

<template>
  <div class="response" :class="status">
    <div class="response-head">
      <span class="badge">{{ status }}</span>
      <span v-if="state.ranAt" class="ran-at">{{ state.ranAt }}</span>
    </div>
    <pre v-if="pretty">{{ pretty }}</pre>
    <p v-else class="empty">Sem resposta ainda.</p>
  </div>
</template>

<style scoped>
.response {
  margin-top: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #0b0f16;
  overflow: hidden;
}
.response-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: #1f2937;
  color: #9ca3af;
}
.response.ok .badge {
  background: #064e3b;
  color: #6ee7b7;
}
.response.error .badge {
  background: #7f1d1d;
  color: #fca5a5;
}
.response.loading .badge {
  background: #1e3a8a;
  color: #93c5fd;
}
.ran-at {
  font-size: 0.7rem;
  color: #6b7280;
}
pre {
  margin: 0;
  padding: 0.6rem;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: #d1d5db;
}
.empty {
  margin: 0;
  padding: 0.6rem;
  font-size: 0.78rem;
  color: #6b7280;
}
</style>
