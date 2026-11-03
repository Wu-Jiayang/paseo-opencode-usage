import {
  balanceToneFromRemaining,
  toneFromUsedPct,
  unavailable,
  windowFromReportedDuration,
  type UsageReport,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import { z } from "zod";
import { readCredential } from "./opencode-store.js";
import { HARNESS } from "./accounts.js";
import type { CredentialInput } from "../shared/input.js";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

const windowSchema = z.object({
  used_percent: z.coerce.number().finite().optional(),
  reset_at: z.number().optional(),
  limit_window_seconds: z.number().nullish(),
});

const responseSchema = z.object({
  plan_type: z.string().optional(),
  email: z.string().optional(),
  rate_limit: z
    .object({
      primary_window: windowSchema.nullish(),
      secondary_window: windowSchema.nullish(),
    })
    .nullish(),
  additional_rate_limits: z
    .array(
      z.object({
        limit_name: z.string().optional(),
        metered_feature: z.string().optional(),
        rate_limit: z
          .object({
            primary_window: windowSchema.nullish(),
            secondary_window: windowSchema.nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
  credits: z.object({ balance: z.coerce.number().finite().optional() }).nullish(),
});

export async function fetchCodexUsage(
  input: CredentialInput,
  fetchApi: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageReport> {
  const credential = await readCredential(input.integration, input.credentialId, env);
  if (!credential) throw new Error("OpenCode login store no longer exists");
  if (!credential.access) throw new Error("OpenCode login has no ChatGPT token");
  if (credential.expires !== undefined && credential.expires <= Date.now()) {
    return unavailable({
      kind: "expired",
      expiresAt: new Date(credential.expires).toISOString(),
      refreshedBy: "opencode",
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.access}`,
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  };
  if (credential.accountId) headers["ChatGPT-Account-Id"] = credential.accountId;

  const response = await fetchApi(USAGE_URL, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    return unavailable({ kind: "rejected", status: response.status, refreshedBy: "opencode" });
  }
  if (!response.ok) throw new Error(`Codex usage API returned ${response.status}`);
  const text = await response.text();
  if (text.trim().startsWith("<")) throw new Error("Codex usage API returned HTML");
  const usage = responseSchema.parse(JSON.parse(text));

  const windows: UsageWindow[] = [
    ...planWindows(usage.rate_limit, true),
    ...(usage.additional_rate_limits ?? []).flatMap((limit) => {
      const identity = limit.metered_feature || limit.limit_name;
      if (!identity) return [];
      return planWindows(limit.rate_limit, false, {
        id: `limit:${encodeURIComponent(identity)}`,
        label: limit.limit_name || identity,
      });
    }),
  ];

  const balance = usage.credits?.balance;
  return {
    status: "available",
    ...(usage.plan_type ? { planLabel: usage.plan_type } : {}),
    windows,
    balances:
      balance === undefined
        ? []
        : [
            {
              id: "credits",
              label: "Credits",
              remaining: balance,
              unit: "credits",
              tone: balanceToneFromRemaining(balance),
            },
          ],
    details: usage.email ? [{ id: "email", label: "Account", value: usage.email }] : [],
  };
}

function planWindows(
  rateLimit: z.infer<typeof responseSchema>["rate_limit"],
  summary: boolean,
  scope?: { id: string; label: string },
): UsageWindow[] {
  if (!rateLimit) return [];
  return (["primary_window", "secondary_window"] as const).flatMap((slot) => {
    const value = rateLimit[slot];
    if (!value) return [];
    const primary = slot === "primary_window";
    return [
      windowFromReportedDuration({
        durationSeconds: value.limit_window_seconds ?? null,
        unknown: {
          id: primary ? "unknown_primary" : "unknown_secondary",
          label: primary ? "Primary limit" : "Secondary limit",
          shortLabel: "",
        },
        ...(scope ? { scope } : {}),
        summary,
        utilizationPct: value.used_percent,
        resetsAt: value.reset_at != null ? new Date(value.reset_at * 1000).toISOString() : null,
        tone: toneFromUsedPct(value.used_percent),
      }),
    ];
  });
}
