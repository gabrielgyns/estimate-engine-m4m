import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

// baseURL is intentionally omitted: the client defaults to the current origin
// (http://localhost:3000) and calls /api/auth/*, which Vite proxies to :8080.
// The client plugins mirror the server plugins configured in src/lib/auth.ts.
export const authClient = createAuthClient({
  plugins: [usernameClient(), organizationClient()],
});
