<script setup lang="ts">
import { reactive } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseCard from "../ui/BaseCard.vue";
import BaseField from "../ui/BaseField.vue";

const form = reactive({
  currentPassword: "",
  newPassword: "",
  revokeOtherSessions: true,
});
const { loading, error, saved, run } = useAsync();

async function save() {
  await run(() =>
    authClient.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
      revokeOtherSessions: form.revokeOtherSessions,
    })
  );
  if (saved.value) {
    form.currentPassword = "";
    form.newPassword = "";
  }
}
</script>

<template>
  <BaseCard title="Senha" subtitle="Atualize sua senha de acesso.">
    <form @submit.prevent="save">
      <BaseField
        v-model="form.currentPassword"
        label="Senha atual"
        type="password"
        autocomplete="current-password"
        required
      />
      <BaseField
        v-model="form.newPassword"
        label="Nova senha"
        type="password"
        autocomplete="new-password"
        hint="Mínimo 8 caracteres."
        required
      />
      <label class="check">
        <input v-model="form.revokeOtherSessions" type="checkbox" />
        Encerrar sessões em outros dispositivos
      </label>
      <div class="foot">
        <BaseAlert v-if="error">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success">Senha alterada.</BaseAlert>
        <span v-else />
        <BaseButton type="submit" size="sm" :loading="loading">
          Alterar senha
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
.check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  cursor: pointer;
}
.check input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
