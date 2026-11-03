import {
  balanceToneFromRemaining,
  unavailable,
  type UsageReport,
} from "@getpaseo/plugin/server/usage";
import { z } from "zod";
import { readCredential } from "./opencode-store.js";
import type { CredentialInput } from "../shared/input.js";

const BALANCE_URL = "https://api.deepseek.com/user/balance";

const responseSchema = z.object({
  is_available: z.boolean().optional(),
  balance_infos: z
    .array(
      z.object({
        currency: z.string(),
        total_balance: z.string(),
        granted_balance: z.string().optional(),
        topped_up_balance: z.string().optional(),
      }),
    )
    .optional(),
});

export async function fetchDeepseekUsage(
  input: CredentialInput,
  fetchApi: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageReport> {
  const credential = await readCredential(input.integration, input.credentialId, env);
  if (!credential) throw new Error("OpenCode login store no longer exists");
  if (!credential.key) throw new Error("OpenCode login has no DeepSeek key");

  const response = await fetchApi(BALANCE_URL, {
    headers: {
      Authorization: `Bearer ${credential.key}`,
      Accept: "application/json",
      "Accept-Encoding": "identity",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    return unavailable({ kind: "rejected", status: response.status, refreshedBy: "opencode" });
  }
  if (!response.ok) throw new Error(`DeepSeek balance API returned ${response.status}`);
  const payload = responseSchema.parse(await response.json());
  const balances = payload.balance_infos ?? [];
  const picked =
    balances.find((entry) => entry.currency === "USD") ??
    balances.find((entry) => entry.currency === "CNY") ??
    balances[0];
  if (!picked) throw new Error("DeepSeek balance API returned no balance");

  const remaining = Number.parseFloat(picked.total_balance);
  const currency = picked.currency.toUpperCase();
  return {
    status: "available",
    windows: [],
    balances: [
      {
        id: "balance",
        label: currency === "CNY" ? "余额 (CNY)" : "Balance",
        remaining: Number.isFinite(remaining) ? remaining : null,
        unit: currency === "CNY" ? "credits" : "usd",
        tone: balanceToneFromRemaining(remaining),
      },
    ],
  };
}
