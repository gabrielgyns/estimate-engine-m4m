<script setup lang="ts">
defineProps<{ tone?: "error" | "success" }>();
</script>

<template>
  <p class="alert" :class="tone ?? 'error'">
    <slot />
  </p>
</template>

<style scoped>
.alert {
  margin: 0;
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid;
}
.error {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: rgba(245, 101, 101, 0.25);
}
.success {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: rgba(62, 207, 142, 0.25);
}
</style>
