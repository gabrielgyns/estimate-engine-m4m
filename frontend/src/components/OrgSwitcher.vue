<script setup lang="ts">
import { computed, ref } from "vue";
import { authClient } from "../lib/auth-client";

interface OrgLike {
  id: string;
  name: string;
  slug?: string;
}

const activeOrg = authClient.useActiveOrganization();
const orgList = authClient.useListOrganizations();

const open = ref(false);
const switching = ref<string | null>(null);

const organizations = computed<OrgLike[]>(
  () => (orgList.value.data as OrgLike[] | null) ?? []
);
const active = computed<OrgLike | null>(
  () => (activeOrg.value.data as OrgLike | null) ?? null
);

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function select(id: string) {
  if (id === active.value?.id) {
    open.value = false;
    return;
  }
  switching.value = id;
  await authClient.organization.setActive({ organizationId: id });
  switching.value = null;
  open.value = false;
}
</script>

<template>
  <div class="switcher">
    <button class="trigger" type="button" @click="open = !open">
      <span class="badge" :class="{ empty: !active }">
        {{ active ? initials(active.name) : "—" }}
      </span>
      <span class="meta">
        <span class="eyebrow">Organização</span>
        <span class="name">{{ active ? active.name : "Nenhuma ativa" }}</span>
      </span>
      <svg
        class="chev"
        :class="{ up: open }"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <transition name="pop">
      <div v-if="open" class="menu">
        <div v-if="orgList.isPending" class="state">Carregando…</div>
        <template v-else>
          <button
            v-for="org in organizations"
            :key="org.id"
            class="item"
            type="button"
            :class="{ active: org.id === active?.id }"
            @click="select(org.id)"
          >
            <span class="badge sm">{{ initials(org.name) }}</span>
            <span class="item-name">{{ org.name }}</span>
            <svg
              v-if="org.id === active?.id"
              class="check"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span v-else-if="switching === org.id" class="mini-spin" />
          </button>
          <p v-if="!organizations.length" class="state">
            Sem organizações ainda.
          </p>
        </template>
        <router-link class="manage" :to="{ name: 'organizations' }" @click="open = false">
          Gerenciar organizações
        </router-link>
      </div>
    </transition>

    <button
      v-if="open"
      class="backdrop"
      type="button"
      aria-label="Fechar"
      @click="open = false"
    />
  </div>
</template>

<style scoped>
.switcher {
  position: relative;
}
.trigger {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}
.trigger:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}
.badge {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
}
.badge.sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 0.7rem;
}
.badge.empty {
  color: var(--text-dim);
  background: var(--surface-3);
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}
.eyebrow {
  font-size: 0.62rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chev {
  color: var(--text-dim);
  transition: transform 0.2s ease;
}
.chev.up {
  transform: rotate(180deg);
}

.menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 30;
  padding: 0.4rem;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.5rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
}
.item:hover {
  background: var(--surface-3);
}
.item-name {
  flex: 1;
  font-size: 0.86rem;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item.active .item-name {
  color: var(--accent);
}
.check {
  color: var(--accent);
}
.state {
  padding: 0.6rem 0.5rem;
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-dim);
}
.manage {
  display: block;
  margin-top: 0.3rem;
  padding: 0.55rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
.manage:hover {
  color: var(--accent);
}
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: transparent;
  border: none;
  cursor: default;
}
.mini-spin {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--text-dim);
  border-right-color: transparent;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
