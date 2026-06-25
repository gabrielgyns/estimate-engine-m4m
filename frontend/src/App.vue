<script setup lang="ts">
// Root shell — the router decides between the public auth pages and the
// authenticated app layout. Global atmosphere lives in style.css.
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="route" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<style>
.route-enter-active,
.route-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.route-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.route-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
