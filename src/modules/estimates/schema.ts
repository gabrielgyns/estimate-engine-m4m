import z from "zod";

export const estimateStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "declined",
]);

export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const leadSnapshotSchema = z.object({
  firstName: z.string(),
  lastName: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string(),
  address: z.string().nullish(),
  zipCode: z.string(),
});

export const estimateSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status: estimateStatusSchema,
  leadId: z.uuid(),
  leadSnapshot: leadSnapshotSchema,
  inputSnapshot: jsonObjectSchema,
  breakdownSnapshot: jsonObjectSchema,
  publicToken: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sentAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
});

export type Estimate = z.infer<typeof estimateSchema>;

export const estimateSummarySchema = estimateSchema.pick({
  id: true,
  number: true,
  status: true,
  leadId: true,
  leadSnapshot: true,
  createdAt: true,
});

export type EstimateSummary = z.infer<typeof estimateSummarySchema>;

export const createEstimateSchema = z.object({
  leadId: z.uuid(),
  inputSnapshot: jsonObjectSchema,
  breakdownSnapshot: jsonObjectSchema,
});

export type CreateEstimate = z.infer<typeof createEstimateSchema>;

export const updateEstimateSchema = z
  .object({
    inputSnapshot: jsonObjectSchema.optional(),
    breakdownSnapshot: jsonObjectSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateEstimate = z.infer<typeof updateEstimateSchema>;
