<script setup lang="ts">
defineProps<{ title?: string; subtitle?: string }>();
</script>

<template>
  <section class="card">
    <header v-if="title || $slots.actions" class="card-head">
      <div>
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 40%),
    var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.35rem;
  box-shadow: var(--shadow);
}
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
h3 {
  font-size: 1.12rem;
}
.subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
