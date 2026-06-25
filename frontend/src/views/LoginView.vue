<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authClient } from "../lib/auth-client";
import { useAsync } from "../composables/useAsync";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseField from "../components/ui/BaseField.vue";
import AuthAside from "../components/AuthAside.vue";

const route = useRoute();
const router = useRouter();
const mode = ref<"email" | "username">("email");
const form = reactive({ email: "", username: "", password: "" });
const { loading, error, run } = useAsync();

async function submit() {
  const result = await run(() =>
    mode.value === "username"
      ? authClient.signIn.username({
          username: form.username,
          password: form.password,
        })
      : authClient.signIn.email({
          email: form.email,
          password: form.password,
        })
  );
  if (result) {
    const redirect = route.query.redirect;
    await router.push(typeof redirect === "string" ? redirect : { name: "dashboard" });
  }
}
</script>

<template>
  <div class="auth">
    <AuthAside />

    <div class="panel">
      <div class="form-wrap">
        <header class="head">
          <h1>Bem-vindo de volta</h1>
          <p>Entre para gerenciar suas organizações e orçamentos.</p>
        </header>

        <div class="seg">
          <button
            type="button"
            :class="{ on: mode === 'email' }"
            @click="mode = 'email'"
          >
            Email
          </button>
          <button
            type="button"
            :class="{ on: mode === 'username' }"
            @click="mode = 'username'"
          >
            Username
          </button>
        </div>

        <form @submit.prevent="submit">
          <BaseField
            v-if="mode === 'email'"
            v-model="form.email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="voce@empresa.com"
            required
          />
          <BaseField
            v-else
            v-model="form.username"
            label="Username"
            type="text"
            autocomplete="username"
            placeholder="seu-usuario"
            required
          />
          <BaseField
            v-model="form.password"
            label="Senha"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />

          <BaseAlert v-if="error">{{ error }}</BaseAlert>

          <BaseButton type="submit" block :loading="loading">
            Entrar
          </BaseButton>
        </form>

        <p class="switch">
          Ainda não tem conta?
          <router-link :to="{ name: 'register' }">Criar conta</router-link>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  min-height: 100vh;
}
.panel {
  display: grid;
  place-items: center;
  padding: 2rem 1.5rem;
}
.form-wrap {
  width: 100%;
  max-width: 380px;
  animation: rise 0.5s ease both;
}
.head h1 {
  font-size: 2rem;
}
.head p {
  margin: 0.5rem 0 1.6rem;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.seg {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: 1.2rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.seg button {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.seg button.on {
  color: var(--text);
  background: var(--surface-3);
}
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.switch {
  margin-top: 1.4rem;
  font-size: 0.88rem;
  color: var(--text-muted);
  text-align: center;
}
.switch a {
  color: var(--accent);
  font-weight: 600;
}
.switch a:hover {
  text-decoration: underline;
}

@media (max-width: 860px) {
  .auth {
    grid-template-columns: 1fr;
  }
}
</style>
