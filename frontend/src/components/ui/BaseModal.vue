<script setup lang="ts">
import { watch } from "vue";

const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener("keydown", onKey);
    } else {
      window.removeEventListener("keydown", onKey);
    }
  }
);
</script>

<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="modal" role="dialog" aria-modal="true">
          <header>
            <h3>{{ title }}</h3>
            <button class="x" type="button" aria-label="Fechar" @click="emit('close')">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div class="body">
            <slot />
          </div>
          <footer v-if="$slots.actions">
            <slot name="actions" />
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(3, 5, 9, 0.66);
  backdrop-filter: blur(4px);
}
.modal {
  width: 100%;
  max-width: 440px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 30%),
    var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
header h3 {
  font-size: 1.1rem;
}
.x {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--text-dim);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
.x:hover {
  color: var(--text);
  background: var(--surface-2);
}
.body {
  padding: 1.25rem;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s ease;
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}
</style>
