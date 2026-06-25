<script setup lang="ts">
import { computed } from "vue";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../composables/useAuth";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseButton from "../components/ui/BaseButton.vue";

const { user } = useAuth();
const activeOrg = authClient.useActiveOrganization();
const orgList = authClient.useListOrganizations();

const firstName = computed(() => user.value?.name?.split(" ")[0] ?? "");
const orgCount = computed(() => (orgList.value.data?.length as number) ?? 0);
const activeName = computed(
  () => (activeOrg.value.data as { name?: string } | null)?.name ?? "Nenhuma"
);

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) {
    return "Bom dia";
  }
  if (h < 18) {
    return "Boa tarde";
  }
  return "Boa noite";
});
</script>

<template>
  <div class="page">
    <header class="page-head">
      <p class="eyebrow">{{ greeting }}</p>
      <h1>Olá, {{ firstName }} 👋</h1>
      <p class="lead">Aqui está o resumo da sua conta.</p>
    </header>

    <div class="stats">
      <article class="stat">
        <span class="stat-label">Organização ativa</span>
        <span class="stat-value">{{ activeName }}</span>
        <span class="stat-foot accent">contexto atual</span>
      </article>
      <article class="stat">
        <span class="stat-label">Suas organizações</span>
        <span class="stat-value">{{ orgCount }}</span>
        <span class="stat-foot">total que você participa</span>
      </article>
      <article class="stat">
        <span class="stat-label">Status da sessão</span>
        <span class="stat-value">
          <span class="pulse" />Ativa
        </span>
        <span class="stat-foot">autenticado via better-auth</span>
      </article>
    </div>

    <BaseCard
      title="Próximos passos"
      subtitle="A engine de cálculo entra nas próximas fases. Por ora, organize seu workspace."
    >
      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <div>
            <h4>Crie uma organização</h4>
            <p>Cada empresa de limpeza é uma organização separada.</p>
          </div>
          <BaseButton
            variant="ghost"
            size="sm"
            @click="$router.push({ name: 'organizations' })"
          >
            Organizações
          </BaseButton>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <div>
            <h4>Defina a organização ativa</h4>
            <p>Use o seletor na barra lateral para trocar de contexto.</p>
          </div>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <div>
            <h4>Revise sua conta</h4>
            <p>Confira seus dados de perfil e sessão.</p>
          </div>
          <BaseButton
            variant="ghost"
            size="sm"
            @click="$router.push({ name: 'account' })"
          >
            Conta
          </BaseButton>
        </div>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 1.8rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.page-head h1 {
  font-size: 2.1rem;
  margin: 0.3rem 0 0.4rem;
}
.lead {
  margin: 0;
  color: var(--text-muted);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 1.25rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 50%),
    var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.stat-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.stat-foot {
  font-size: 0.76rem;
  color: var(--text-dim);
}
.stat-foot.accent {
  color: var(--accent);
}
.pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 var(--accent-glow);
  animation: pulse 2s ease-out infinite;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 var(--accent-glow);
  }
  70% {
    box-shadow: 0 0 0 9px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.step {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.step > div {
  flex: 1;
}
.step-num {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(62, 207, 142, 0.2);
}
.step h4 {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.94rem;
  font-weight: 600;
}
.step p {
  margin: 0.15rem 0 0;
  font-size: 0.83rem;
  color: var(--text-muted);
}
</style>
