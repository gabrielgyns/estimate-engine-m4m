<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../composables/useAuth";
import OrgSwitcher from "./OrgSwitcher.vue";

const router = useRouter();
const route = useRoute();
const { user } = useAuth();
const signingOut = ref(false);

// `exact` marks the index route (Dashboard → /app): without it, every /app/*
// path prefix-matches and would keep Dashboard highlighted. Section items stay
// active on their children too (e.g. Leads on /app/leads/new).
const nav = [
  { name: "dashboard", label: "Dashboard", icon: "grid", path: "/app", exact: true },
  { name: "leads", label: "Leads", icon: "leads", path: "/app/leads" },
  { name: "organizations", label: "Organizações", icon: "org", path: "/app/organizations" },
  { name: "account", label: "Conta", icon: "user", path: "/app/account" },
] as const;

function isActive(item: (typeof nav)[number]): boolean {
  if (item.exact) {
    return route.path === item.path;
  }
  return route.path === item.path || route.path.startsWith(`${item.path}/`);
}

const displayName = computed(() => user.value?.name ?? "Usuário");
const email = computed(() => user.value?.email ?? "");
const initials = computed(() =>
  displayName.value
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
);

async function signOut() {
  signingOut.value = true;
  await authClient.signOut();
  await router.push({ name: "login" });
}
</script>

<template>
  <aside class="sidebar">
    <router-link class="brand" :to="{ name: 'dashboard' }">
      <span class="mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 13.5 10.5 7l4 4L20 5.5"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="20" cy="5.5" r="1.8" fill="currentColor" />
        </svg>
      </span>
      <span class="wordmark">
        Estimate<span class="accent">Engine</span>
      </span>
    </router-link>

    <nav class="nav">
      <router-link
        v-for="item in nav"
        :key="item.name"
        class="nav-link"
        :class="{ active: isActive(item) }"
        :to="{ name: item.name }"
      >
        <span class="ico" aria-hidden="true">
          <svg
            v-if="item.icon === 'grid'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <svg
            v-else-if="item.icon === 'leads'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <svg
            v-else-if="item.icon === 'org'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 21h18" />
            <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
            <path d="M19 21V11a2 2 0 0 0-2-2h-2" />
            <path d="M9 7h2M9 11h2M9 15h2" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-3.5 3.6-6 8-6s8 2.5 8 6" />
          </svg>
        </span>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="bottom">
      <OrgSwitcher />

      <div class="user">
        <span class="avatar">{{ initials }}</span>
        <span class="user-meta">
          <span class="user-name">{{ displayName }}</span>
          <span class="user-email">{{ email }}</span>
        </span>
        <button
          class="logout"
          type="button"
          :disabled="signingOut"
          title="Sair"
          aria-label="Sair"
          @click="signOut"
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 264px;
  height: 100vh;
  position: sticky;
  top: 0;
  padding: 1.25rem 0.9rem 1rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 30%),
    var(--sidebar);
  border-right: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.5rem 0.9rem;
}
.mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 20px -10px var(--accent-glow);
}
.wordmark {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.18rem;
  letter-spacing: -0.02em;
}
.wordmark .accent {
  color: var(--accent);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 0.4rem;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.62rem 0.7rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 0.92rem;
  font-weight: 500;
  position: relative;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.nav-link:hover {
  color: var(--text);
  background: var(--surface);
}
.nav-link.active {
  color: var(--text);
  background: var(--surface-2);
}
.nav-link.active::before {
  content: "";
  position: absolute;
  left: -0.9rem;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(var(--accent), var(--accent-2));
}
.nav-link.active .ico {
  color: var(--accent);
}
.ico {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--text-dim);
  transition: color 0.16s ease;
}
.ico svg {
  width: 19px;
  height: 19px;
}
.nav-link:hover .ico {
  color: var(--text-muted);
}

.bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.8rem;
}
.user {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
}
.user-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.user-name {
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-email {
  font-size: 0.72rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.logout {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  color: var(--text-dim);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.logout:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
</style>
