<script setup lang="ts">
import { onMounted, ref } from "vue";

const backendUp = ref<boolean | null>(null);

async function pingBackend() {
  try {
    const res = await fetch("/api/auth/ok").catch(() => null);
    // /api/auth/ok is better-auth's health route; any HTTP response means the
    // proxy reached the backend, even a 404.
    backendUp.value = res !== null;
  } catch {
    backendUp.value = false;
  }
}

onMounted(pingBackend);
</script>

<template>
  <div class="app">
    <header>
      <div>
        <h1>Auth Harness</h1>
        <p class="subtitle">
          Playground das rotas <code>/api/auth/*</code> — proxy para
          <code>:8080</code>
        </p>
      </div>
      <button type="button" class="ping" :class="backendUp" @click="pingBackend">
        <span v-if="backendUp === null">backend ?</span>
        <span v-else-if="backendUp">backend online</span>
        <span v-else>backend offline</span>
      </button>
    </header>

    <main>
      <SignUpPanel />
      <SignInPanel />
      <SessionPanel />
      <OrganizationPanel />
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}
h1 {
  margin: 0;
  font-size: 1.6rem;
}
.subtitle {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.85rem;
}
code {
  background: #111827;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.8em;
}
.ping {
  border: 1px solid var(--border);
  background: #111827;
  color: #9ca3af;
  font-size: 0.75rem;
  white-space: nowrap;
}
.ping.true {
  border-color: #064e3b;
  color: #6ee7b7;
}
.ping.false {
  border-color: #7f1d1d;
  color: #fca5a5;
}
main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
</style>
