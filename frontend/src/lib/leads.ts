import { apiFetch } from "./api";

export type LeadStage =
  | "new_lead"
  | "contacted"
  | "estimate_sent"
  | "won"
  | "lost";

// Mirrors the backend `leadSchema` (src/modules/leads/schema.ts). `id` is
// server-generated, so it is absent from the create payload.
export interface Lead {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  address?: string;
  addressComplement?: string;
  zipCode: string;
  stage?: LeadStage;
  source?: string;
  otherInformation?: string;
  organizationId?: string;
}

// Mirrors the backend `createLeadSchema`. `phone`, `firstName` and `zipCode`
// are required; the rest is optional and omitted when blank.
export interface LeadInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone: string;
  address?: string;
  zipCode: string;
  source?: string;
  otherInformation?: string;
}

export function listLeads(): Promise<{ leads: Lead[] }> {
  return apiFetch<{ leads: Lead[] }>("/leads");
}

export function getLead(id: string): Promise<{ lead: Lead }> {
  return apiFetch<{ lead: Lead }>(`/leads/${id}`);
}

// POST /leads returns only the new lead's id (201).
export function createLead(input: LeadInput): Promise<{ leadId: string }> {
  return apiFetch<{ leadId: string }>("/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// PATCH /leads/:id updates an existing lead and returns its id (200). The body
// is partial server-side, but we send the full editable set so absent optional
// fields aren't reset to null by the backend.
export function updateLead(
  id: string,
  input: LeadInput
): Promise<{ leadId: string }> {
  return apiFetch<{ leadId: string }>(`/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function fullName(lead: Pick<Lead, "firstName" | "lastName">): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
}
