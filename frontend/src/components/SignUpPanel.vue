<script setup lang="ts">
import { reactive } from "vue";
import { authClient } from "../lib/auth-client";
import { useAction } from "../lib/useAction";

const form = reactive({
  name: "Helena",
  username: "helena",
  email: "helena@example.com",
  password: "password123",
});

const { state, run } = useAction();

function submit() {
  run(() =>
    authClient.signUp.email({
      name: form.name,
      username: form.username,
      email: form.email,
      password: form.password,
    })
  );
}
</script>

<template>
  <section class="panel">
    <h2>Sign Up</h2>
    <form @submit.prevent="submit">
      <label>
        Name
        <input v-model="form.name" type="text" autocomplete="name" />
      </label>
      <label>
        Username
        <input v-model="form.username" type="text" autocomplete="username" />
      </label>
      <label>
        Email
        <input v-model="form.email" type="email" autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="form.password" type="password" autocomplete="new-password" />
      </label>
      <button type="submit" :disabled="state.loading">
        {{ state.loading ? "Criando…" : "signUp.email" }}
      </button>
    </form>
    <ResponseBox :state="state" />
  </section>
</template>
