import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth-schema";

export const leadStages = pgEnum("lead_stages", [
  "new_lead",
  "contacted",
  "estimate_sent",
  "won",
  "lost",
]);

export const leads = pgTable(
  "leads",
  {
    id: uuid().primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text(),
    phone: text().notNull(),
    address: text(),
    zipCode: text("zip_code").notNull(),
    leadStages: leadStages("lead_stages").notNull().default("new_lead"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("leads_org_phone_uidx").on(table.organizationId, table.phone),
  ]
);
