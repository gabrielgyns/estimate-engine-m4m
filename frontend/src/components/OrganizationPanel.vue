<script setup lang="ts">
import { reactive } from "vue";
import { authClient } from "../lib/auth-client";
import { useAction } from "../lib/useAction";

const form = reactive({
  name: "Helena Cleaning Co",
  slug: "helena-cleaning",
  organizationId: "",
});

const createAction = useAction();
const listAction = useAction();
const setActiveAction = useAction();

function create() {
  createAction.run(() =>
    authClient.organization.create({ name: form.name, slug: form.slug })
  );
}

function list() {
  listAction.run(() => authClient.organization.list());
}

function setActive() {
  setActiveAction.run(() =>
    authClient.organization.setActive({
      organizationId: form.organizationId || null,
    })
  );
}
</script>

<template>
  <section class="panel">
    <h2>Organization</h2>

    <form @submit.prevent="create">
      <label>
        Name
        <input v-model="form.name" type="text" />
      </label>
      <label>
        Slug
        <input v-model="form.slug" type="text" />
      </label>
      <button type="submit" :disabled="createAction.state.value.loading">
        organization.create
      </button>
    </form>
    <ResponseBox v-if="createAction.state.value.ranAt" :state="createAction.state.value" />

    <hr />

    <button type="button" :disabled="listAction.state.value.loading" @click="list">
      organization.list
    </button>
    <ResponseBox v-if="listAction.state.value.ranAt" :state="listAction.state.value" />

    <hr />

    <form @submit.prevent="setActive">
      <label>
        Organization ID (vazio = nenhuma)
        <input v-model="form.organizationId" type="text" placeholder="org_..." />
      </label>
      <button type="submit" :disabled="setActiveAction.state.value.loading">
        organization.setActive
      </button>
    </form>
    <ResponseBox v-if="setActiveAction.state.value.ranAt" :state="setActiveAction.state.value" />
  </section>
</template>

<style scoped>
hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1rem 0;
}
</style>
