import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** How close a window or a balance is to its limit. */
export const liveToneSchema = z.enum(["default", "ok", "warning", "danger"]);

const windowSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** A few characters naming the window, e.g. "5h" or "wk". */
  shortLabel: z.string(),
  usedPct: z.number().nullable(),
  remainingPct: z.number().nullable(),
  resetsAt: z.string().nullable(),
  tone: liveToneSchema,
});

const balanceSchema = z.object({
  id: z.string(),
  label: z.string(),
  used: z.number().nullable(),
  remaining: z.number().nullable(),
  limit: z.number().nullable(),
  unit: z.enum(["usd", "credits", "requests", "tokens"]),
  /** The currency the amount is in, when the provider names one. */
  currency: z.string().nullable(),
  tone: liveToneSchema,
});

const detailSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

const providerSchema = z.object({
  id: z.enum(["codex", "minimax", "deepseek"]),
  label: z.string(),
  status: z.enum(["available", "unavailable", "error"]),
  /** Why a provider is unavailable or failed. */
  detail: z.string().nullable(),
  /** The plan the account is on, when the provider names one. */
  planLabel: z.string().nullable(),
  windows: z.array(windowSchema),
  balances: z.array(balanceSchema),
  details: z.array(detailSchema),
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
export type LiveWindow = z.infer<typeof windowSchema>;
export type LiveBalance = z.infer<typeof balanceSchema>;
export type LiveDetail = z.infer<typeof detailSchema>;
export type LiveTone = z.infer<typeof liveToneSchema>;
