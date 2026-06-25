<script setup lang="ts">
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { authClient } from "../lib/auth-client";
import { useAsync } from "../composables/useAsync";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseField from "../components/ui/BaseField.vue";
import AuthAside from "../components/AuthAside.vue";

const router = useRouter();
const form = reactive({ name: "", username: "", email: "", password: "" });
const { loading, error, run } = useAsync();

async function submit() {
  const result = await run(() =>
    authClient.signUp.email({
      name: form.name,
      username: form.username,
      email: form.email,
      password: form.password,
    })
  );
  if (result) {
    await router.push({ name: "dashboard" });
  }
}
</script>

<template>
  <div class="auth">
    <AuthAside />

    <div class="panel">
      <div class="form-wrap">
        <header class="head">
          <h1>Criar sua conta</h1>
          <p>Comece a configurar preços e gerar orçamentos em minutos.</p>
        </header>

        <form @submit.prevent="submit">
          <div class="row">
            <BaseField
              v-model="form.name"
              label="Nome"
              type="text"
              autocomplete="name"
              placeholder="Helena Souza"
              required
            />
            <BaseField
              v-model="form.username"
              label="Username"
              type="text"
              autocomplete="username"
              placeholder="helena"
              required
            />
          </div>
          <BaseField
            v-model="form.email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="voce@empresa.com"
            required
          />
          <BaseField
            v-model="form.password"
            label="Senha"
            type="password"
            autocomplete="new-password"
            placeholder="mínimo 8 caracteres"
            hint="Use ao menos 8 caracteres."
            required
          />

          <BaseAlert v-if="error">{{ error }}</BaseAlert>

          <BaseButton type="submit" block :loading="loading">
            Criar conta
          </BaseButton>
        </form>

        <p class="switch">
          Já tem conta?
          <router-link :to="{ name: 'login' }">Entrar</router-link>
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
  max-width: 400px;
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
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
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
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
