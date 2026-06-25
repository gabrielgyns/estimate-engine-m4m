import { ref } from "vue";

export interface ActionState {
  data: unknown;
  error: unknown;
  loading: boolean;
  ranAt: string | null;
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return err;
}

/**
 * Wraps a single async call (typically a better-auth client method) and tracks
 * its loading / result / error state so a ResponseBox can render the raw output.
 *
 * better-auth client methods resolve to `{ data, error }` instead of throwing,
 * so the resolved value is stored as-is. Network-level throws are caught too.
 */
export function useAction() {
  const state = ref<ActionState>({
    loading: false,
    data: null,
    error: null,
    ranAt: null,
  });

  async function run(fn: () => Promise<unknown>) {
    state.value = { loading: true, data: null, error: null, ranAt: null };
    try {
      const result = await fn();
      state.value = {
        loading: false,
        data: result,
        error: null,
        ranAt: new Date().toLocaleTimeString(),
      };
    } catch (err) {
      state.value = {
        loading: false,
        data: null,
        error: serializeError(err),
        ranAt: new Date().toLocaleTimeString(),
      };
    }
  }

  return { state, run };
}
