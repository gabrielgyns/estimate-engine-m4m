import { ref } from "vue";

interface BetterAuthResult {
  error?: { message?: string; code?: string } | null;
}

function messageFrom(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "Algo deu errado. Tente novamente.";
}

/**
 * Tracks the lifecycle of a single async action (form submit, mutation).
 *
 * better-auth client methods resolve to `{ data, error }` instead of throwing,
 * so `run` inspects the resolved `error` field and surfaces it. Returns the
 * resolved value on success, or `null` when an error was captured.
 */
export function useAsync<T>() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const saved = ref(false);

  async function run(fn: () => Promise<T>): Promise<T | null> {
    loading.value = true;
    error.value = null;
    saved.value = false;
    try {
      const result = await fn();
      const maybe = result as BetterAuthResult | null;
      if (maybe && maybe.error) {
        error.value = maybe.error.message ?? "Falha na operação.";
        return null;
      }
      saved.value = true;
      return result;
    } catch (err) {
      error.value = messageFrom(err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, saved, run };
}
