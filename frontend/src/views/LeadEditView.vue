<script setup lang="ts">
import { reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAsync } from "../composables/useAsync";
import { useLead } from "../composables/useLead";
import { type LeadInput, updateLead } from "../lib/leads";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseField from "../components/ui/BaseField.vue";

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;

const { lead, loading, error: loadError } = useLead(id);
const { loading: saving, error: saveError, run } = useAsync<{ leadId: string }>();

const form = reactive({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  zipCode: "",
  address: "",
});

// Prefill the form once the lead is loaded.
watch(lead, (value) => {
  if (!value) {
    return;
  }
  form.firstName = value.firstName ?? "";
  form.lastName = value.lastName ?? "";
  form.email = value.email ?? "";
  form.phone = value.phone ?? "";
  form.zipCode = value.zipCode ?? "";
  form.address = value.address ?? "";
});

// Required fields are always sent; optional ones are dropped when blank (the
// backend resets absent optional fields to null, which is the desired "clear").
function buildPayload(): LeadInput {
  const payload: LeadInput = {
    firstName: form.firstName.trim(),
    phone: form.phone.trim(),
    zipCode: form.zipCode.trim(),
  };
  const optional = ["lastName", "email", "address"] as const;
  for (const key of optional) {
    const value = form[key].trim();
    if (value) {
      payload[key] = value;
    }
  }
  return payload;
}

async function submit() {
  const result = await run(() => updateLead(id, buildPayload()));
  if (result) {
    await router.push({ name: "lead-detail", params: { id } });
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <RouterLink class="back" :to="{ name: 'lead-detail', params: { id } }">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Lead
      </RouterLink>
      <h1>Editar lead</h1>
      <p class="lead">Atualize os dados do contato.</p>
    </header>

    <BaseAlert v-if="loadError" tone="error">{{ loadError }}</BaseAlert>

    <div v-else-if="loading" class="state">Carregando lead…</div>

    <BaseCard v-else-if="lead" class="form-card">
      <form @submit.prevent="submit">
        <div class="row">
          <BaseField
            v-model="form.firstName"
            label="Nome"
            placeholder="Helena"
            required
          />
          <BaseField
            v-model="form.lastName"
            label="Sobrenome"
            placeholder="Souza Lima"
          />
        </div>

        <div class="row">
          <BaseField
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="helena@email.com"
          />
          <BaseField
            v-model="form.phone"
            label="Telefone"
            type="tel"
            placeholder="(11) 99999-9999"
            required
          />
        </div>

        <BaseField
          v-model="form.zipCode"
          label="CEP"
          placeholder="01310-100"
          required
        />

        <BaseField
          v-model="form.address"
          label="Endereço"
          placeholder="Av. Paulista, 1000"
        />

        <BaseAlert v-if="saveError">{{ saveError }}</BaseAlert>

        <div class="actions">
          <BaseButton
            variant="subtle"
            type="button"
            @click="$router.push({ name: 'lead-detail', params: { id } })"
          >
            Cancelar
          </BaseButton>
          <BaseButton type="submit" :loading="saving">Salvar alterações</BaseButton>
        </div>
      </form>
    </BaseCard>

    <div v-else class="state">Lead não encontrado.</div>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 1.6rem;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.7rem;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.16s ease;
}
.back:hover {
  color: var(--text);
}
.page-head h1 {
  font-size: 2.1rem;
}
.lead {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
}

.state {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
}

.form-card {
  max-width: 640px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.1rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
