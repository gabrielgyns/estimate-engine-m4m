<script setup lang="ts">
import { useId } from "vue";

defineOptions({ inheritAttrs: false });
defineProps<{ label: string; hint?: string }>();
const model = defineModel<string>();
const fieldId = useId();
</script>

<template>
  <div class="field">
    <label :for="fieldId">{{ label }}</label>
    <slot :id="fieldId" :model="model">
      <input :id="fieldId" v-model="model" v-bind="$attrs" />
    </slot>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-muted);
}
.field :deep(input),
.field :deep(select) {
  width: 100%;
  padding: 0.7rem 0.8rem;
  font-family: var(--font-body);
  font-size: 0.95rem;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
}
.field :deep(input::placeholder) {
  color: var(--text-dim);
}
.field :deep(input:focus),
.field :deep(select:focus) {
  outline: none;
  border-color: var(--accent);
  background: var(--surface-3);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.hint {
  margin: 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}
</style>
