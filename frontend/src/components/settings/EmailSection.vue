<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../composables/useAuth";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseCard from "../ui/BaseCard.vue";
import BaseField from "../ui/BaseField.vue";

const { user } = useAuth();
const currentEmail = computed(() => user.value?.email ?? "");
const newEmail = ref("");
const { loading, error, saved, run } = useAsync();

watch(currentEmail, () => {
  newEmail.value = "";
});

async function save() {
  await run(() => authClient.changeEmail({ newEmail: newEmail.value }));
  if (saved.value) {
    newEmail.value = "";
  }
}
</script>

<template>
  <BaseCard title="Email" subtitle="Endereço usado para entrar e receber avisos.">
    <form @submit.prevent="save">
      <BaseField label="Email atual">
        <input :value="currentEmail" type="email" disabled />
      </BaseField>
      <BaseField
        v-model="newEmail"
        label="Novo email"
        type="email"
        autocomplete="email"
        placeholder="novo@empresa.com"
        required
      />
      <div class="foot">
        <BaseAlert v-if="error">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success">Email atualizado.</BaseAlert>
        <span v-else />
        <BaseButton type="submit" size="sm" :loading="loading">
          Atualizar email
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
:deep(input:disabled) {
  color: var(--text-dim);
  cursor: not-allowed;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
</style>
