<script setup lang="ts">
import { computed, ref } from "vue";
import { useLeads } from "../composables/useLeads";
import { fullName, type Lead } from "../lib/leads";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";

const { leads, loading, error, refresh } = useLeads();
const query = ref("");

const filtered = computed<Lead[]>(() => {
  const term = query.value.trim().toLowerCase();
  if (!term) {
    return leads.value;
  }
  return leads.value.filter((lead) => {
    const haystack = [
      fullName(lead),
      lead.email,
      lead.phone,
      lead.zipCode,
      lead.address,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
});

function initials(lead: Lead): string {
  return `${lead.firstName[0] ?? ""}${lead.lastName[0] ?? ""}`.toUpperCase();
}

function addressLine(lead: Lead): string {
  return [lead.address, lead.addressComplement].filter(Boolean).join(", ");
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>Leads</h1>
        <p class="lead">Contatos capturados para orçamento.</p>
      </div>
      <BaseButton @click="$router.push({ name: 'lead-new' })">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Novo lead
      </BaseButton>
    </header>

    <div class="toolbar">
      <div class="search">
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
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          v-model="query"
          type="search"
          placeholder="Buscar por nome, email, telefone…"
          aria-label="Buscar leads"
        />
      </div>
      <span v-if="!loading && !error" class="count">
        {{ filtered.length }} {{ filtered.length === 1 ? "lead" : "leads" }}
      </span>
    </div>

    <BaseAlert v-if="error" tone="error" class="mt">
      {{ error }}
      <button class="retry" type="button" @click="refresh">Tentar de novo</button>
    </BaseAlert>

    <div v-if="loading" class="state">Carregando leads…</div>

    <div v-else-if="!error && !leads.length" class="empty">
      <span class="empty-mark" aria-hidden="true">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      </span>
      <p>Nenhum lead ainda.</p>
      <span>Cadastre o primeiro contato para começar.</span>
      <BaseButton class="mt" @click="$router.push({ name: 'lead-new' })">
        Novo lead
      </BaseButton>
    </div>

    <div
      v-else-if="!error && !filtered.length"
      class="state"
    >
      Nenhum lead corresponde a “{{ query }}”.
    </div>

    <div v-else-if="!error" class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contato</th>
            <th>Endereço</th>
            <th class="num">CEP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lead in filtered" :key="lead.id">
            <td>
              <div class="who">
                <span class="badge">{{ initials(lead) }}</span>
                <span class="name">{{ fullName(lead) }}</span>
              </div>
            </td>
            <td>
              <div class="stack">
                <span v-if="lead.email" class="strong">{{ lead.email }}</span>
                <span v-if="lead.phone" class="dim">{{ lead.phone }}</span>
                <span v-if="!(lead.email || lead.phone)" class="dim">—</span>
              </div>
            </td>
            <td>
              <span v-if="addressLine(lead)">{{ addressLine(lead) }}</span>
              <span v-else class="dim">—</span>
            </td>
            <td class="num mono">{{ lead.zipCode }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.6rem;
}
.page-head h1 {
  font-size: 2.1rem;
}
.lead {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
.search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 380px;
  color: var(--text-dim);
}
.search svg {
  position: absolute;
  left: 0.75rem;
  pointer-events: none;
}
.search input {
  width: 100%;
  padding: 0.6rem 0.8rem 0.6rem 2.3rem;
  font-family: var(--font-body);
  font-size: 0.92rem;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.search input::placeholder {
  color: var(--text-dim);
}
.search input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--surface-3);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.count {
  flex-shrink: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.mt {
  margin-top: 0.9rem;
}
.retry {
  margin-left: 0.6rem;
  font: inherit;
  font-weight: 600;
  color: var(--danger);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}

.state {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 3.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}
.empty-mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 0.5rem;
  color: var(--text-dim);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 14px;
}
.empty p {
  margin: 0;
  font-weight: 600;
  color: var(--text);
}
.empty > span {
  font-size: 0.85rem;
}

.table-wrap {
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.table thead th {
  padding: 0.8rem 1.1rem;
  text-align: left;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  white-space: nowrap;
}
.table tbody td {
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.table tbody tr:last-child td {
  border-bottom: none;
}
.table tbody tr {
  transition: background 0.14s ease;
}
.table tbody tr:hover {
  background: var(--surface-2);
}
.num {
  text-align: right;
}
.mono {
  font-family: var(--font-mono);
  color: var(--text-muted);
}
.who {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.badge {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
}
.name {
  font-weight: 600;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.strong {
  color: var(--text);
}
.dim {
  color: var(--text-dim);
}

@media (max-width: 620px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
