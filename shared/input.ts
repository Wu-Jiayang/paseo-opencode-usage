import { z } from "zod";

export const integrationSchema = z.enum([
  "openai",
  "minimax-coding-plan",
  "minimax-cn-coding-plan",
  "deepseek",
]);

export const credentialInputSchema = z
  .object({
    integration: integrationSchema,
    credentialId: z.string().min(1),
  })
  .strict();

export type CredentialInput = z.infer<typeof credentialInputSchema>;
