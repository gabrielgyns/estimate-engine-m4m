<script setup lang="ts">
import { computed } from "vue";
import { useAuth } from "../composables/useAuth";
import ProfileSection from "../components/settings/ProfileSection.vue";
import EmailSection from "../components/settings/EmailSection.vue";
import PasswordSection from "../components/settings/PasswordSection.vue";
import DeleteAccountSection from "../components/settings/DeleteAccountSection.vue";

const { user } = useAuth();

const name = computed(() => user.value?.name ?? "—");
const email = computed(() => user.value?.email ?? "—");
const initials = computed(() =>
  name.value
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
);
</script>

<template>
  <div class="page">
    <header class="page-head">
      <h1>Conta</h1>
      <p class="lead">Gerencie seu perfil, email, senha e segurança.</p>
    </header>

    <div class="profile-banner">
      <span class="avatar">{{ initials }}</span>
      <div>
        <h2>{{ name }}</h2>
        <p>{{ email }}</p>
      </div>
    </div>

    <div class="grid">
      <ProfileSection />
      <EmailSection />
      <PasswordSection />
    </div>

    <div class="danger-wrap">
      <DeleteAccountSection />
    </div>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 1.5rem;
}
.page-head h1 {
  font-size: 2.1rem;
}
.lead {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
}

.profile-banner {
  display: flex;
  align-items: center;
  gap: 1.1rem;
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.5rem;
  background:
    linear-gradient(180deg, var(--accent-soft), transparent 70%),
    var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 16px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--accent-ink);
  background: linear-gradient(150deg, var(--accent), var(--accent-2));
  box-shadow: 0 12px 28px -12px var(--accent-glow);
}
.profile-banner h2 {
  font-size: 1.35rem;
}
.profile-banner p {
  margin: 0.2rem 0 0;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.25rem;
  align-items: start;
}
.danger-wrap {
  margin-top: 1.25rem;
}
</style>
