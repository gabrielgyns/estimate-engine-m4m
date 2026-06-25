<script setup lang="ts">
import AppSidebar from "../components/AppSidebar.vue";
</script>

<template>
  <div class="shell">
    <AppSidebar />
    <main class="content">
      <router-view v-slot="{ Component }">
        <transition name="view" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}
.content {
  flex: 1;
  min-width: 0;
  padding: 2.4rem clamp(1.25rem, 4vw, 3rem) 3rem;
  max-width: 1180px;
}

.view-enter-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
</style>
