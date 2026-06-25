<script setup lang="ts">
import { computed, ref } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseField from "../ui/BaseField.vue";
import BaseModal from "../ui/BaseModal.vue";

interface OrgLike {
  id: string;
  name: string;
  slug?: string;
}

const activeOrg = authClient.useActiveOrganization();
const org = computed(() => activeOrg.value.data as OrgLike | null);

const open = ref(false);
const confirmText = ref("");
const { loading, error, run } = useAsync();

const canDelete = computed(
  () => Boolean(org.value?.slug) && confirmText.value === org.value?.slug
);

function close() {
  open.value = false;
  confirmText.value = "";
  error.value = null;
}

async function confirmDelete() {
  if (!(org.value && canDelete.value)) {
    return;
  }
  const result = await run(() =>
    authClient.organization.delete({ organizationId: org.value!.id })
  );
  if (result) {
    close();
  }
}
</script>

<template>
  <section class="danger">
    <div class="danger-head">
      <h3>Excluir organização</h3>
      <p>
        Remove permanentemente <strong>{{ org?.name }}</strong> e seus membros.
        Esta ação não pode ser desfeita.
      </p>
    </div>
    <BaseButton variant="danger" @click="open = true">Excluir organização</BaseButton>

    <BaseModal :open="open" title="Excluir organização" @close="close">
      <p class="warn">
        Digite <code>{{ org?.slug }}</code> para confirmar a exclusão.
      </p>
      <BaseField
        v-model="confirmText"
        label="Confirmação"
        :placeholder="org?.slug"
      />
      <BaseAlert v-if="error" class="mt">{{ error }}</BaseAlert>

      <template #actions>
        <BaseButton variant="subtle" @click="close">Cancelar</BaseButton>
        <BaseButton
          variant="danger"
          :loading="loading"
          :disabled="!canDelete"
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
  max-width: 52ch;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.danger-head strong {
  color: var(--text);
}
.warn {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.warn code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
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
