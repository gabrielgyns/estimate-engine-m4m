import z from "zod";

export const leadStageSchema = z.enum([
  "new_lead",
  "contacted",
  "estimate_sent",
  "won",
  "lost",
]);

export const leadSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string(),
  address: z.string().optional(),
  zipCode: z.string(),
  stage: leadStageSchema,
  source: z.string().optional(),
  otherInformation: z.string().optional(),
});

export type Lead = z.infer<typeof leadSchema>;
