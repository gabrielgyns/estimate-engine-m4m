import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Dev server on :3000 (matches CLIENT_ORIGIN / BETTER_AUTH_URL defaults) and
// proxies /api to the Fastify backend on :8080 so the browser sees everything
// same-origin — cookies just work and there is no CORS to fight in dev.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
