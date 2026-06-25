<script setup lang="ts">
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAsync } from "../composables/useAsync";
import { createLead, type LeadInput } from "../lib/leads";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseField from "../components/ui/BaseField.vue";

const router = useRouter();
const { loading, error, run } = useAsync();

const form = reactive({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  zipCode: "",
  address: "",
  addressComplement: "",
});

// Drop empty optional fields so we don't send blank strings for them.
function buildPayload(): LeadInput {
  const payload: LeadInput = {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    zipCode: form.zipCode.trim(),
  };
  const optional = ["email", "phone", "address", "addressComplement"] as const;
  for (const key of optional) {
    const value = form[key].trim();
    if (value) {
      payload[key] = value;
    }
  }
  return payload;
}

async function submit() {
  const result = await run(() => createLead(buildPayload()));
  if (result) {
    await router.push({ name: "leads" });
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <RouterLink class="back" :to="{ name: 'leads' }">
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
        Leads
      </RouterLink>
      <h1>Novo lead</h1>
      <p class="lead">Cadastre um contato para gerar orçamentos.</p>
    </header>

    <BaseCard class="form-card">
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
            required
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

        <BaseField
          v-model="form.addressComplement"
          label="Complemento"
          hint="Apartamento, bloco, ponto de referência."
          placeholder="Apto 52"
        />

        <BaseAlert v-if="error">{{ error }}</BaseAlert>

        <div class="actions">
          <BaseButton
            variant="subtle"
            type="button"
            @click="$router.push({ name: 'leads' })"
          >
            Cancelar
          </BaseButton>
          <BaseButton type="submit" :loading="loading">Criar lead</BaseButton>
        </div>
      </form>
    </BaseCard>
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
