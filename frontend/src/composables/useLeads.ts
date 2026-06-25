import { onMounted, ref } from "vue";
import { type Lead, listLeads } from "../lib/leads";

// Loads and holds the lead list for the active session. `refresh` re-fetches on
// demand (e.g. after a create or a retry from an error state).
export function useLeads() {
  const leads = ref<Lead[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const data = await listLeads();
      leads.value = data.leads ?? [];
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Não foi possível carregar os leads.";
    } finally {
      loading.value = false;
    }
  }

  onMounted(refresh);

  return { leads, loading, error, refresh };
}
