<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "subtle" | "danger";
    size?: "md" | "sm";
    type?: "button" | "submit";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
    block: false,
  }
);
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`v-${variant}`, `s-${size}`, { block, loading }]"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <span class="label"><slot /></span>
  </button>
</template>

<style scoped>
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: var(--font-body);
  font-weight: 600;
  line-height: 1;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition:
    transform 0.12s ease,
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease;
}
.btn:active {
  transform: translateY(1px);
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.btn.block {
  width: 100%;
}

.s-md {
  padding: 0.7rem 1.05rem;
  font-size: 0.92rem;
}
.s-sm {
  padding: 0.45rem 0.75rem;
  font-size: 0.82rem;
}

.v-primary {
  background: var(--accent);
  color: var(--accent-ink);
}
.v-primary:not(:disabled):hover {
  background: var(--accent-2);
}

.v-ghost {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border);
}
.v-ghost:not(:disabled):hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.v-subtle {
  background: transparent;
  color: var(--text-muted);
  border-color: transparent;
}
.v-subtle:not(:disabled):hover {
  background: var(--surface-2);
  color: var(--text);
}

.v-danger {
  background: var(--danger-soft);
  color: var(--danger);
  border-color: rgba(245, 101, 101, 0.25);
}
.v-danger:not(:disabled):hover {
  background: rgba(245, 101, 101, 0.18);
}

.loading .label {
  opacity: 0.85;
}
.spinner {
  width: 0.85em;
  height: 0.85em;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 0.6s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
