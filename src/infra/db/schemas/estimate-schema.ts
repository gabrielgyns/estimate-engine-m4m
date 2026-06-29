import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth-schema";
import { leads } from "./lead-schema";

// import type { QuoteInput, QuoteBreakdown } from "@/domain/pricing/types";

interface LeadSnapshot {
  address?: string | null;
  email?: string | null;
  firstName: string;
  lastName?: string | null;
  phone: string;
  zipCode: string;
}

export const estimateStatus = pgEnum("estimate_status", [
  "draft",
  "sent",
  "accepted",
  "declined",
]);

export const estimates = pgTable(
  "estimates",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: integer("number").notNull(),
    status: estimateStatus().notNull().default("draft"),
    leadSnapshot: jsonb("lead_snapshot").$type<LeadSnapshot>().notNull(),
    inputSnapshot: jsonb("input_snapshot")
      // .$type<QuoteInput>()
      .notNull(),
    breakdownSnapshot: jsonb("breakdown_snapshot")
      // .$type<QuoteBreakdown>()
      .notNull(),
    publicToken: text("public_token").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("estimates_public_token_uidx").on(table.publicToken),
    uniqueIndex("estimates_org_number_uidx").on(
      table.organizationId,
      table.number
    ),
    index("estimates_org_idx").on(table.organizationId),
    index("estimates_org_lead_idx").on(table.organizationId, table.leadId),
    index("estimates_org_status_idx").on(table.organizationId, table.status),
  ]
);

export const estimateNumberCounters = pgTable("estimate_number_counters", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
