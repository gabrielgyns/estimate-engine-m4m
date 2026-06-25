import { and, eq } from "drizzle-orm";
import { db } from "@/infra/db";
import { leads } from "@/infra/db/schemas";
import type { Lead } from "./schema";

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
