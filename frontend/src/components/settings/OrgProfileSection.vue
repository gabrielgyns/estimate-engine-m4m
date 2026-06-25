<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAsync } from "../../composables/useAsync";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseButton from "../ui/BaseButton.vue";
import BaseCard from "../ui/BaseCard.vue";
import BaseField from "../ui/BaseField.vue";

interface OrgLike {
  id: string;
  name: string;
  slug?: string;
}

const activeOrg = authClient.useActiveOrganization();
const org = computed(() => activeOrg.value.data as OrgLike | null);

const form = reactive({ name: "", slug: "" });
const { loading, error, saved, run } = useAsync();

watch(
  org,
  (value) => {
    form.name = value?.name ?? "";
    form.slug = value?.slug ?? "";
  },
  { immediate: true }
);

async function save() {
  if (!org.value) {
    return;
  }
  await run(() =>
    authClient.organization.update({
      organizationId: org.value!.id,
      data: { name: form.name, slug: form.slug },
    })
  );
}
</script>

<template>
  <BaseCard title="Dados da organização" subtitle="Nome e identificador.">
    <form @submit.prevent="save">
      <BaseField v-model="form.name" label="Nome" required />
      <BaseField
        v-model="form.slug"
        label="Slug"
        hint="Identificador único, usado em URLs."
        required
      />
      <div class="foot">
        <BaseAlert v-if="error">{{ error }}</BaseAlert>
        <BaseAlert v-else-if="saved" tone="success">Organização atualizada.</BaseAlert>
        <span v-else />
        <BaseButton type="submit" size="sm" :loading="loading">Salvar</BaseButton>
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
