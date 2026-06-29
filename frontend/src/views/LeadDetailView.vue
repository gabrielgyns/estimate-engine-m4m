<script setup lang="ts">
import { useRoute } from "vue-router";
import { useLead } from "../composables/useLead";
import { fullName, type LeadStage } from "../lib/leads";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";

const route = useRoute();
const id = route.params.id as string;
const { lead, loading, error, refresh } = useLead(id);

const STAGE_LABELS: Record<LeadStage, string> = {
  new_lead: "Novo",
  contacted: "Contatado",
  estimate_sent: "Orçamento enviado",
  won: "Ganho",
  lost: "Perdido",
};

function stageLabel(stage?: LeadStage): string {
  return stage ? STAGE_LABELS[stage] : "—";
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
    </header>

    <BaseAlert v-if="error" tone="error">
      {{ error }}
      <button class="retry" type="button" @click="refresh">Tentar de novo</button>
    </BaseAlert>

    <div v-else-if="loading" class="state">Carregando lead…</div>

    <BaseCard v-else-if="lead" :title="fullName(lead)" subtitle="Detalhes do lead">
      <template #actions>
        <div class="head-actions">
          <span class="stage" :data-stage="lead.stage">{{ stageLabel(lead.stage) }}</span>
          <BaseButton
            variant="subtle"
            @click="$router.push({ name: 'lead-edit', params: { id } })"
          >
            Editar
          </BaseButton>
        </div>
      </template>

      <dl class="grid">
        <div class="item">
          <dt>Email</dt>
          <dd>{{ lead.email || "—" }}</dd>
        </div>
        <div class="item">
          <dt>Telefone</dt>
          <dd>{{ lead.phone || "—" }}</dd>
        </div>
        <div class="item">
          <dt>Endereço</dt>
          <dd>{{ lead.address || "—" }}</dd>
        </div>
        <div class="item">
          <dt>CEP</dt>
          <dd class="mono">{{ lead.zipCode || "—" }}</dd>
        </div>
      </dl>
    </BaseCard>

    <div v-else class="state">Lead não encontrado.</div>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 1.4rem;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.14s ease;
}
.back:hover {
  color: var(--text);
}

.state {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
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

.head-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.stage {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  font-size: 0.76rem;
  font-weight: 600;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  white-space: nowrap;
}
.stage[data-stage="won"] {
  color: #0f7b3f;
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.3);
}
.stage[data-stage="lost"] {
  color: #b42318;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
}
.stage[data-stage="estimate_sent"],
.stage[data-stage="contacted"] {
  color: var(--accent-ink);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.1rem 1.6rem;
  margin: 0;
}
.item dt {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 0.3rem;
}
.item dd {
  margin: 0;
  color: var(--text);
  word-break: break-word;
}
.mono {
  font-family: var(--font-mono);
  color: var(--text-muted);
}

@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
