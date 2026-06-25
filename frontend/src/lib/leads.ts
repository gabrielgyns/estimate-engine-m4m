import { apiFetch } from "./api";

// Mirrors the backend `leadSchema` (src/modules/leads/routes.ts). `id` is
// server-generated, so it is absent from the create payload.
export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  addressComplement?: string;
  zipCode: string;
  organizationId: string;
}

export type LeadInput = Omit<Lead, "id">;

export function listLeads(): Promise<{ leads: Lead[] }> {
  return apiFetch<{ leads: Lead[] }>("/leads");
}

export function createLead(input: LeadInput): Promise<Lead> {
  return apiFetch<Lead>("/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fullName(lead: Pick<Lead, "firstName" | "lastName">): string {
  return `${lead.firstName} ${lead.lastName}`.trim();
}
