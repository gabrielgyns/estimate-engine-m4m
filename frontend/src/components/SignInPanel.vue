<script setup lang="ts">
import { reactive, ref } from "vue";
import { authClient } from "../lib/auth-client";
import { useAction } from "../lib/useAction";

const mode = ref<"email" | "username">("email");

const form = reactive({
  email: "helena@example.com",
  username: "helena",
  password: "password123",
});

const { state, run } = useAction();

function submit() {
  run(() => {
    if (mode.value === "username") {
      return authClient.signIn.username({
        username: form.username,
        password: form.password,
      });
    }
    return authClient.signIn.email({
      email: form.email,
      password: form.password,
    });
  });
}
</script>

<template>
  <section class="panel">
    <h2>Sign In</h2>
    <div class="tabs">
      <button
        type="button"
        :class="{ active: mode === 'email' }"
        @click="mode = 'email'"
      >
        por email
      </button>
      <button
        type="button"
        :class="{ active: mode === 'username' }"
        @click="mode = 'username'"
      >
        por username
      </button>
    </div>
    <form @submit.prevent="submit">
      <label v-if="mode === 'email'">
        Email
        <input v-model="form.email" type="email" autocomplete="email" />
      </label>
      <label v-else>
        Username
        <input v-model="form.username" type="text" autocomplete="username" />
      </label>
      <label>
        Password
        <input v-model="form.password" type="password" autocomplete="current-password" />
      </label>
      <button type="submit" :disabled="state.loading">
        {{ state.loading ? "Entrando…" : `signIn.${mode}` }}
      </button>
    </form>
    <ResponseBox :state="state" />
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.tabs button {
  flex: 1;
  background: #111827;
  color: #9ca3af;
}
.tabs button.active {
  background: var(--accent);
  color: #06281e;
  font-weight: 600;
}
</style>
