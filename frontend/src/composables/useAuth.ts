import { computed } from "vue";
import { authClient } from "../lib/auth-client";

// Single reactive session shared across the whole app. better-auth keeps this
// in sync after sign in / sign out / org changes via its internal signals.
const session = authClient.useSession();

export function useAuth() {
  const user = computed(() => session.value.data?.user ?? null);
  const isAuthenticated = computed(() => Boolean(session.value.data));
  const isPending = computed(() => session.value.isPending);

  return { session, user, isAuthenticated, isPending };
}
