<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { authClient } from "../lib/auth-client";
import { useAsync } from "../composables/useAsync";
import BaseAlert from "../components/ui/BaseAlert.vue";
import BaseButton from "../components/ui/BaseButton.vue";
import BaseCard from "../components/ui/BaseCard.vue";
import BaseField from "../components/ui/BaseField.vue";
import OrgProfileSection from "../components/settings/OrgProfileSection.vue";
import OrgMembersSection from "../components/settings/OrgMembersSection.vue";
import DeleteOrgSection from "../components/settings/DeleteOrgSection.vue";

interface OrgLike {
  id: string;
  name: string;
  slug?: string;
}

const orgList = authClient.useListOrganizations();
const activeOrg = authClient.useActiveOrganization();

const organizations = computed<OrgLike[]>(
  () => (orgList.value.data as OrgLike[] | null) ?? []
);
const activeOrgData = computed(() => activeOrg.value.data as OrgLike | null);
const activeId = computed(() => activeOrgData.value?.id ?? null);

const form = reactive({ name: "", slug: "" });
const slugTouched = ref(false);
const create = useAsync();
const settingActive = ref<string | null>(null);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

watch(
  () => form.name,
  (name) => {
    if (!slugTouched.value) {
      form.slug = slugify(name);
    }
  }
);

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function submitCreate() {
  const result = await create.run(() =>
    authClient.organization.create({ name: form.name, slug: form.slug })
  );
  if (result) {
    form.name = "";
    form.slug = "";
    slugTouched.value = false;
  }
}

async function makeActive(id: string) {
  settingActive.value = id;
  await authClient.organization.setActive({ organizationId: id });
  settingActive.value = null;
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Organizações</h1>
      <p class="lead">Gerencie a organização ativa, membros e o catálogo de empresas.</p>
    </header>

    <!-- Active organization management -->
    <section v-if="activeId" class="block">
      <div class="block-head">
        <h2>Organização ativa</h2>
        <span class="pill">{{ activeOrgData?.name }}</span>
      </div>
      <div class="manage-grid">
        <OrgProfileSection />
        <OrgMembersSection />
      </div>
      <DeleteOrgSection class="danger-row" />
    </section>

    <hr class="sep" />

    <!-- Catalog: create + list + switch -->
    <section class="block">
      <div class="block-head">
        <h2>Todas as organizações</h2>
      </div>
      <div class="grid">
        <BaseCard
          class="create"
          title="Nova organização"
          subtitle="Cada empresa de limpeza é uma organização."
        >
          <form @submit.prevent="submitCreate">
            <BaseField
              v-model="form.name"
              label="Nome"
              placeholder="Helena Cleaning Co"
              required
            />
            <BaseField
              v-model="form.slug"
              label="Slug"
              hint="Identificador único, usado em URLs."
              placeholder="helena-cleaning"
              required
              @input="slugTouched = true"
            />
            <BaseAlert v-if="create.error.value">{{ create.error.value }}</BaseAlert>
            <BaseButton type="submit" block :loading="create.loading.value">
              Criar organização
            </BaseButton>
          </form>
        </BaseCard>

        <div class="list">
          <div class="list-head">
            <h3>Suas organizações</h3>
            <span class="count">{{ organizations.length }}</span>
          </div>

          <div v-if="orgList.isPending" class="empty">Carregando…</div>

          <div v-else-if="!organizations.length" class="empty">
            <span class="empty-mark">⌗</span>
            <p>Nenhuma organização ainda.</p>
            <span>Crie a primeira no formulário ao lado.</span>
          </div>

          <ul v-else class="orgs">
            <li
              v-for="org in organizations"
              :key="org.id"
              class="org"
              :class="{ active: org.id === activeId }"
            >
              <span class="badge">{{ initials(org.name) }}</span>
              <div class="org-meta">
                <span class="org-name">{{ org.name }}</span>
                <span class="org-slug">{{ org.slug }}</span>
              </div>
              <span v-if="org.id === activeId" class="tag">Ativa</span>
              <BaseButton
                v-else
                variant="ghost"
                size="sm"
                :loading="settingActive === org.id"
                @click="makeActive(org.id)"
              >
                Tornar ativa
              </BaseButton>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 1.8rem;
}
.page-head h1 {
  font-size: 2.1rem;
}
.lead {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
}

.block-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1rem;
}
.block-head h2 {
  font-size: 1.25rem;
}
.pill {
  padding: 0.25rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(62, 207, 142, 0.22);
  border-radius: 99px;
}
.manage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  align-items: start;
}
.danger-row {
  margin-top: 1.25rem;
}
.sep {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2rem 0;
}

.grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 1.25rem;
  align-items: start;
}
.create form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.list {
  display: flex;
  flex-direction: column;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}
.list-head h3 {
  font-size: 1.05rem;
}
.count {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 0.45rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 99px;
}

.orgs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.org {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}
.org:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.org.active {
  border-color: rgba(62, 207, 142, 0.35);
  background:
    linear-gradient(180deg, var(--accent-soft), transparent 60%),
    var(--surface);
}
.badge {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 11px;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
}
.org-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.org-name {
  font-size: 0.96rem;
  font-weight: 600;
}
.org-slug {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--text-dim);
}
.tag {
  padding: 0.3rem 0.65rem;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(62, 207, 142, 0.25);
  border-radius: 99px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}
.empty-mark {
  font-size: 2rem;
  color: var(--text-dim);
}
.empty p {
  margin: 0;
  font-weight: 600;
  color: var(--text);
}
.empty span {
  font-size: 0.84rem;
}

@media (max-width: 980px) {
  .manage-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 880px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
