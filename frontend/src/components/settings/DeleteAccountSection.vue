<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { authClient } from "../../lib/auth-client";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseField from "../ui/BaseField.vue";
import BaseModal from "../ui/BaseModal.vue";

const router = useRouter();
const open = ref(false);
const password = ref("");
const { loading, error, run } = useAsync();

function close() {
  open.value = false;
  password.value = "";
  error.value = null;
}

async function confirmDelete() {
  const result = await run(() =>
    authClient.deleteUser({ password: password.value })
  );
  if (result) {
    await router.push({ name: "login" });
  }
}
</script>

<template>
  <section class="danger">
    <div class="danger-head">
      <h3>Excluir conta</h3>
      <p>
        Remove permanentemente sua conta e todos os dados associados. Esta ação
        não pode ser desfeita.
      </p>
    </div>
    <BaseButton variant="danger" @click="open = true">Excluir conta</BaseButton>

    <BaseModal :open="open" title="Excluir sua conta" @close="close">
      <p class="warn">
        Confirme sua senha para excluir a conta permanentemente. Não há volta.
      </p>
      <BaseField
        v-model="password"
        label="Senha"
        type="password"
        autocomplete="current-password"
        placeholder="••••••••"
      />
      <BaseAlert v-if="error" class="mt">{{ error }}</BaseAlert>

      <template #actions>
        <BaseButton variant="subtle" @click="close">Cancelar</BaseButton>
        <BaseButton
          variant="danger"
          :loading="loading"
          :disabled="!password"
          @click="confirmDelete"
        >
          Excluir definitivamente
        </BaseButton>
      </template>
    </BaseModal>
  </section>
</template>

<style scoped>
.danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.35rem;
  background: var(--surface);
  border: 1px solid rgba(245, 101, 101, 0.25);
  border-radius: var(--radius);
}
.danger-head h3 {
  font-size: 1.05rem;
  color: var(--danger);
}
.danger-head p {
  margin: 0.3rem 0 0;
  max-width: 48ch;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.warn {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.mt {
  margin-top: 0.9rem;
}
@media (max-width: 620px) {
  .danger {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
