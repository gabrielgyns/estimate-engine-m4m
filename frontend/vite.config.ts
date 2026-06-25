import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Dev server on :3000 (matches CLIENT_ORIGIN / BETTER_AUTH_URL defaults) and
// proxies backend paths to Fastify on :8080 so the browser sees everything
// same-origin — cookies just work and there is no CORS to fight in dev.
// `/api` covers better-auth (`/api/auth/*`); `/leads` covers the leads routes,
// which the backend currently mounts without an `/api` prefix.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8080",
      "/leads": "http://localhost:8080",
    },
  },
});
