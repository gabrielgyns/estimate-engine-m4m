<script setup lang="ts">
import { computed, ref } from "vue";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../composables/useAuth";
import BaseAlert from "../ui/BaseAlert.vue";
import BaseCard from "../ui/BaseCard.vue";

interface Member {
  id: string;
  role: string;
  userId: string;
  user?: { name?: string; email?: string };
}

const { user } = useAuth();
const activeOrg = authClient.useActiveOrganization();
const members = computed<Member[]>(
  () =>
    ((activeOrg.value.data as { members?: Member[] } | null)?.members as
      | Member[]
      | undefined) ?? []
);

const busyId = ref<string | null>(null);
const error = ref<string | null>(null);

const ASSIGNABLE_ROLES = ["admin", "member"];

function label(member: Member): string {
  return member.user?.name || member.user?.email || "Membro";
}

function initials(member: Member): string {
  return label(member)
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function changeRole(member: Member, role: string) {
  if (role === member.role) {
    return;
  }
  busyId.value = member.id;
  error.value = null;
  const res = await authClient.organization.updateMemberRole({
    memberId: member.id,
    role: role as "admin" | "member",
  });
  if (res.error) {
    error.value = res.error.message ?? "Não foi possível alterar o papel.";
  }
  busyId.value = null;
}

async function remove(member: Member) {
  busyId.value = member.id;
  error.value = null;
  const res = await authClient.organization.removeMember({
    memberIdOrEmail: member.id,
  });
  if (res.error) {
    error.value = res.error.message ?? "Não foi possível remover o membro.";
  }
  busyId.value = null;
}
</script>

<template>
  <BaseCard
    title="Membros"
    :subtitle="`${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'} nesta organização.`"
  >
    <BaseAlert v-if="error" class="mb">{{ error }}</BaseAlert>

    <ul class="members">
      <li v-for="member in members" :key="member.id" class="member">
        <span class="badge">{{ initials(member) }}</span>
        <div class="meta">
          <span class="name">
            {{ label(member) }}
            <span v-if="member.userId === user?.id" class="you">você</span>
          </span>
          <span class="email">{{ member.user?.email }}</span>
        </div>

        <span v-if="member.role === 'owner'" class="owner-tag">owner</span>
        <select
          v-else
          class="role"
          :value="member.role"
          :disabled="busyId === member.id"
          @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in ASSIGNABLE_ROLES" :key="r" :value="r">{{ r }}</option>
        </select>

        <button
          v-if="member.role !== 'owner' && member.userId !== user?.id"
          class="remove"
          type="button"
          :disabled="busyId === member.id"
          title="Remover"
          aria-label="Remover membro"
          @click="remove(member)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
        <span v-else class="spacer" />
      </li>
    </ul>
  </BaseCard>
</template>

<style scoped>
.mb {
  margin-bottom: 1rem;
}
.members {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.member {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.6rem 0.7rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.badge {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
}
.meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.name {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  font-weight: 600;
}
.you {
  padding: 0.05rem 0.4rem;
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 99px;
}
.email {
  font-size: 0.78rem;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.role {
  padding: 0.4rem 0.55rem;
  font-size: 0.82rem;
  color: var(--text);
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 7px;
  cursor: pointer;
}
.owner-tag {
  padding: 0.3rem 0.6rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid rgba(62, 207, 142, 0.25);
  border-radius: 99px;
}
.remove {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--text-dim);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}
.remove:hover {
  color: var(--danger);
  border-color: rgba(245, 101, 101, 0.3);
  background: var(--danger-soft);
}
.spacer {
  width: 32px;
  flex-shrink: 0;
}
</style>
