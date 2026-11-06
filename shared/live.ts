import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const windowSchema = z.object({
  id: z.string(),
  label: z.string(),
  usedPct: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

const balanceSchema = z.object({
  label: z.string(),
  remaining: z.number().nullable(),
  unit: z.string(),
});

const providerSchema = z.object({
  id: z.enum(["codex", "minimax", "deepseek"]),
  label: z.string(),
  status: z.enum(["available", "unavailable", "error"]),
  /** Why a provider is unavailable or failed. */
  detail: z.string().nullable(),
  windows: z.array(windowSchema),
  balances: z.array(balanceSchema),
});

/**
 * A direct read of the provider quotas, without the daemon's usage report
 * cache. The sidebar row polls this so the numbers move faster than the
 * five-minute cache the Usage page reads from.
 */
export const liveUsageRpc = defineRpc({
  name: "opencode-usage.live",
  input: z.object({}),
  output: z.object({
    fetchedAt: z.number(),
    providers: z.array(providerSchema),
  }),
});

export type LiveUsage = z.infer<typeof liveUsageRpc.output>;
export type LiveProvider = z.infer<typeof providerSchema>;
