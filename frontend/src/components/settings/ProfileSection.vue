<script setup lang="ts">
import { reactive, watch } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../composables/useAuth";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseCard from "../ui/BaseCard.vue";
import BaseField from "../ui/BaseField.vue";

const { user } = useAuth();
const form = reactive({ name: "", username: "" });
const { loading, error, saved, run } = useAsync();

// Sync the form whenever the authenticated user loads or changes.
watch(
  user,
  (value) => {
    form.name = value?.name ?? "";
    form.username = (value as { username?: string } | null)?.username ?? "";
  },
  { immediate: true }
);

async function save() {
  await run(() =>
    authClient.updateUser({ name: form.name, username: form.username })
  );
}
</script>

<template>
  <BaseCard title="Perfil" subtitle="Como você aparece na plataforma.">
    <form @submit.prevent="save">
      <BaseField
        v-model="form.name"
        label="Nome"
        autocomplete="name"
        required
      />
      <BaseField
        v-model="form.username"
        label="Username"
        autocomplete="username"
        required
      />
      <div class="foot">
        <BaseAlert v-if="error">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success">Perfil atualizado.</BaseAlert>
        <span v-else />
        <BaseButton type="submit" size="sm" :loading="loading">
          Salvar
        </BaseButton>
      </div>
    </form>
  </BaseCard>
</template>

<style scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
