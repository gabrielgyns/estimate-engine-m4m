import { and, eq } from "drizzle-orm";
import { db } from "@/infra/db";
import { leads } from "@/infra/db/schemas";
import type { CreateLead, Lead, UpdateLead } from "./schema";

type LeadRow = typeof leads.$inferSelect;

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone,
    address: row.address ?? undefined,
    zipCode: row.zipCode,
    stage: row.leadStages,
  };
}

export async function findLeadsByOrganization(
  organizationId: string
): Promise<Lead[]> {
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.organizationId, organizationId));

  return rows.map(toLead);
}

export async function findLeadByIdForOrganization(
  id: string,
  organizationId: string
): Promise<Lead | undefined> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)));

  const row = rows.at(0);
  return row ? toLead(row) : undefined;
}

export async function createLeadWithOrganization(
  data: CreateLead,
  organizationId: string
): Promise<string> {
  const [row] = await db
    .insert(leads)
    .values({
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email ?? null,
      phone: data.phone,
      address: data.address ?? null,
      zipCode: data.zipCode,
      organizationId,
    })
    .returning({ id: leads.id });

  return row.id;
}

export async function updateLeadByIdWithOrganization(
  data: UpdateLead,
  leadId: string,
  organizationId: string
): Promise<string | undefined> {
  const values: Partial<typeof leads.$inferInsert> = {};

  if ("firstName" in data) {
    values.firstName = data.firstName;
  }

  if ("lastName" in data) {
    values.lastName = data.lastName ?? null;
  }

  if ("email" in data) {
    values.email = data.email ?? null;
  }

  if ("phone" in data) {
    values.phone = data.phone;
  }

  if ("address" in data) {
    values.address = data.address ?? null;
  }

  if ("zipCode" in data) {
    values.zipCode = data.zipCode;
  }

  if ("stage" in data) {
    values.leadStages = data.stage;
  }

  const [row] = await db
    .update(leads)
    .set(values)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.id, leadId)))
    .returning({ leadId: leads.id });

  return row?.leadId;
}

export async function deleteLeadByIdWithOrganization(
  leadId: string,
  organizationId: string
): Promise<boolean> {
  const [row] = await db
    .delete(leads)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.id, leadId)))
    .returning({ id: leads.id });

  return Boolean(row);
}
