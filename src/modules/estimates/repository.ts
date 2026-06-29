import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/infra/db";
import { estimateNumberCounters, estimates, leads } from "@/infra/db/schemas";
import type {
  CreateEstimate,
  Estimate,
  EstimateSummary,
  UpdateEstimate,
} from "./schema";

type EstimateRow = typeof estimates.$inferSelect;
type LeadRow = typeof leads.$inferSelect;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function toNullableIsoString(value: Date | null): string | null {
  return value ? toIsoString(value) : null;
}

function toLeadSnapshot(row: LeadRow): Estimate["leadSnapshot"] {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    zipCode: row.zipCode,
  };
}

export function toEstimate(row: EstimateRow): Estimate {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    leadId: row.leadId,
    leadSnapshot: row.leadSnapshot,
    inputSnapshot: row.inputSnapshot as Record<string, unknown>,
    breakdownSnapshot: row.breakdownSnapshot as Record<string, unknown>,
    publicToken: row.publicToken,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    sentAt: toNullableIsoString(row.sentAt),
    decidedAt: toNullableIsoString(row.decidedAt),
  };
}

export function toEstimateSummary(row: EstimateRow): EstimateSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    leadId: row.leadId,
    leadSnapshot: row.leadSnapshot,
    createdAt: toIsoString(row.createdAt),
  };
}

async function getNextEstimateNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string
): Promise<number> {
  const [counter] = await tx
    .insert(estimateNumberCounters)
    .values({
      organizationId,
      lastNumber: 1,
    })
    .onConflictDoUpdate({
      target: estimateNumberCounters.organizationId,
      set: {
        lastNumber: sql`${estimateNumberCounters.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ number: estimateNumberCounters.lastNumber });

  return counter.number;
}

export async function findEstimatesByOrganization(
  organizationId: string
): Promise<EstimateSummary[]> {
  const rows = await db
    .select()
    .from(estimates)
    .where(eq(estimates.organizationId, organizationId))
    .orderBy(desc(estimates.createdAt));

  return rows.map(toEstimateSummary);
}

export async function findEstimatesByLeadForOrganization(
  leadId: string,
  organizationId: string
): Promise<EstimateSummary[]> {
  const rows = await db
    .select()
    .from(estimates)
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        eq(estimates.leadId, leadId)
      )
    )
    .orderBy(desc(estimates.createdAt));

  return rows.map(toEstimateSummary);
}

export async function findEstimateByIdForOrganization(
  id: string,
  organizationId: string
): Promise<Estimate | undefined> {
  const rows = await db
    .select()
    .from(estimates)
    .where(
      and(eq(estimates.id, id), eq(estimates.organizationId, organizationId))
    );

  const row = rows.at(0);
  return row ? toEstimate(row) : undefined;
}

export async function createEstimateWithOrganization(
  data: CreateEstimate,
  organizationId: string
): Promise<string | undefined> {
  return await db.transaction(async (tx) => {
    const leadRows = await tx
      .select()
      .from(leads)
      .where(
        and(eq(leads.id, data.leadId), eq(leads.organizationId, organizationId))
      );

    const lead = leadRows.at(0);

    if (!lead) {
      return;
    }

    const number = await getNextEstimateNumber(tx, organizationId);
    const [row] = await tx
      .insert(estimates)
      .values({
        number,
        status: "draft",
        leadSnapshot: toLeadSnapshot(lead),
        inputSnapshot: data.inputSnapshot,
        breakdownSnapshot: data.breakdownSnapshot,
        publicToken: randomBytes(24).toString("base64url"),
        organizationId,
        leadId: data.leadId,
      })
      .returning({ id: estimates.id });

    return row.id;
  });
}

export async function updateEstimateByIdWithOrganization(
  data: UpdateEstimate,
  estimateId: string,
  organizationId: string
): Promise<string | undefined> {
  const values: Partial<typeof estimates.$inferInsert> = {};

  if ("inputSnapshot" in data) {
    values.inputSnapshot = data.inputSnapshot;
  }

  if ("breakdownSnapshot" in data) {
    values.breakdownSnapshot = data.breakdownSnapshot;
  }

  const [row] = await db
    .update(estimates)
    .set(values)
    .where(
      and(
        eq(estimates.id, estimateId),
        eq(estimates.organizationId, organizationId)
      )
    )
    .returning({ id: estimates.id });

  return row?.id;
}

export async function sendEstimateByIdWithOrganization(
  estimateId: string,
  organizationId: string
): Promise<"not_found" | "invalid_status" | string> {
  const existing = await findEstimateByIdForOrganization(
    estimateId,
    organizationId
  );

  if (!existing) {
    return "not_found";
  }

  if (existing.status !== "draft") {
    return "invalid_status";
  }

  const [row] = await db
    .update(estimates)
    .set({
      status: "sent",
      sentAt: new Date(),
    })
    .where(
      and(
        eq(estimates.id, estimateId),
        eq(estimates.organizationId, organizationId)
      )
    )
    .returning({ id: estimates.id });

  return row.id;
}

export async function deleteEstimateByIdWithOrganization(
  estimateId: string,
  organizationId: string
): Promise<boolean> {
  const [row] = await db
    .delete(estimates)
    .where(
      and(
        eq(estimates.id, estimateId),
        eq(estimates.organizationId, organizationId)
      )
    )
    .returning({ id: estimates.id });

  return Boolean(row);
}
