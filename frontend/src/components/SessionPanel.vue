<script setup lang="ts">
import { computed } from "vue";
import { authClient } from "../lib/auth-client";
import { useAction } from "../lib/useAction";

// Reactive session — updates automatically after sign in / sign out.
const session = authClient.useSession();

const sessionJson = computed(() => JSON.stringify(session.value, null, 2));

const getAction = useAction();
const signOutAction = useAction();

function refetch() {
  getAction.run(() => authClient.getSession());
}

function signOut() {
  signOutAction.run(() => authClient.signOut());
}
</script>

<template>
  <section class="panel">
    <h2>Session</h2>
    <div class="live">
      <div class="live-head">
        <span class="badge">useSession (reativo)</span>
        <span v-if="session.isPending" class="ran-at">carregando…</span>
        <span v-else-if="session.data" class="ran-at ok">autenticado</span>
        <span v-else class="ran-at">sem sessão</span>
      </div>
      <pre>{{ sessionJson }}</pre>
    </div>
    <div class="actions">
      <button type="button" :disabled="getAction.state.value.loading" @click="refetch">
        getSession()
      </button>
      <button
        type="button"
        class="danger"
        :disabled="signOutAction.state.value.loading || !session.data"
        @click="signOut"
      >
        signOut()
      </button>
    </div>
    <ResponseBox v-if="getAction.state.value.ranAt" :state="getAction.state.value" />
    <ResponseBox v-if="signOutAction.state.value.ranAt" :state="signOutAction.state.value" />
  </section>
</template>

<style scoped>
.live {
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #0b0f16;
  overflow: hidden;
}
.live-head {
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
.ran-at {
  font-size: 0.7rem;
  color: #6b7280;
}
.ran-at.ok {
  color: #6ee7b7;
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
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.actions button {
  flex: 1;
}
.danger {
  background: #7f1d1d;
  color: #fecaca;
}
.danger:disabled {
  opacity: 0.5;
}
</style>
