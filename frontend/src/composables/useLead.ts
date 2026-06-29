import { onMounted, ref } from "vue";
import { getLead, type Lead } from "../lib/leads";

// Loads a single lead by id (GET /leads/:id). `refresh` re-fetches on demand,
// e.g. after a retry from an error state.
export function useLead(id: string) {
  const lead = ref<Lead | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const data = await getLead(id);
      lead.value = data.lead;
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Não foi possível carregar o lead.";
    } finally {
      loading.value = false;
    }
  }

  onMounted(refresh);

  return { lead, loading, error, refresh };
}
