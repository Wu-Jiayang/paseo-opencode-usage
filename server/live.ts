import type { UsageBalance, UsageReport } from "@getpaseo/plugin/server/usage";
import { toneFromUsedPct } from "@getpaseo/plugin/server/usage";
import { fetchCodexUsage } from "./codex.js";
import { fetchDeepseekUsage } from "./deepseek.js";
import { fetchMinimaxUsage } from "./minimax.js";
import { discoverCredentials } from "./opencode-store.js";
import type { CredentialInput } from "../shared/input.js";
import type { LiveProvider, LiveUsage } from "../shared/live.js";

/**
 * The provider APIs are the slow part, so several clients polling at once
 * share one reading. The window is short enough that a row still looks live.
 */
const CACHE_TTL_MS = 10_000;

let cached: { at: number; usage: LiveUsage } | null = null;

interface ProviderSpec {
  id: LiveProvider["id"];
  label: string;
  integrations: CredentialInput["integration"][];
  fetch: (
    input: CredentialInput,
    fetchApi: typeof fetch,
    env: NodeJS.ProcessEnv,
  ) => Promise<UsageReport>;
}

const PROVIDERS: ProviderSpec[] = [
  {
    id: "codex",
    label: "Codex",
    integrations: ["openai"],
    fetch: (input, fetchApi, env) => fetchCodexUsage(input, fetchApi, env),
  },
  {
    id: "minimax",
    label: "MiniMax",
    integrations: ["minimax-cn-coding-plan", "minimax-coding-plan"],
    fetch: (input, fetchApi, env) => fetchMinimaxUsage(input, fetchApi, env),
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    integrations: ["deepseek"],
    fetch: (input, fetchApi, env) => fetchDeepseekUsage(input, fetchApi, env),
  },
];

/**
 * The currency a balance is in. The provider reports the amount, not the
 * currency, so the name comes from the label it carries.
 */
function currencyOf(balance: UsageBalance): string | null {
  const label = balance.label.toUpperCase();
  if (label.includes("CNY") || label.includes("¥")) return "CNY";
  if (label.includes("USD") || label.includes("$")) return "USD";
  if (balance.unit === "usd") return "USD";
  return null;
}

function describe(report: UsageReport): Pick<
  LiveProvider,
  "status" | "detail" | "planLabel" | "windows" | "balances" | "details"
> {
  if (report.status === "error") {
    return {
      status: "error",
      detail: report.error,
      planLabel: null,
      windows: [],
      balances: [],
      details: [],
    };
  }
  if (report.status === "unavailable") {
    const problem = report.problem;
    const detail =
      problem.kind === "expired"
        ? `Login expired at ${problem.expiresAt}`
        : problem.kind === "rejected"
          ? `Login rejected (HTTP ${problem.status})`
          : problem.detail;
    return {
      status: "unavailable",
      detail,
      planLabel: null,
      windows: [],
      balances: [],
      details: [],
    };
  }
  return {
    status: "available",
    detail: null,
    planLabel: report.planLabel ?? null,
    windows: report.windows.map((window) => ({
      id: window.id,
      label: window.label,
      shortLabel: window.shortLabel ?? "",
      usedPct: window.usedPct ?? null,
      remainingPct: window.remainingPct ?? null,
      resetsAt: window.resetsAt ?? null,
      tone: window.tone ?? toneFromUsedPct(window.usedPct) ?? "default",
    })),
    balances: (report.balances ?? []).map((balance) => ({
      id: balance.id,
      label: balance.label,
      used: balance.used ?? null,
      remaining: balance.remaining ?? null,
      limit: balance.limit ?? null,
      unit: balance.unit,
      currency: currencyOf(balance),
      tone: balance.tone ?? "default",
    })),
    details: (report.details ?? []).map((detail) => ({
      id: detail.id,
      label: detail.label,
      value: detail.value,
    })),
  };
}

async function readProvider(
  spec: ProviderSpec,
  fetchApi: typeof fetch,
  env: NodeJS.ProcessEnv,
): Promise<LiveProvider> {
  for (const integration of spec.integrations) {
    const credential = (await discoverCredentials(integration, env))[0];
    if (!credential) continue;
    const body = describe(
      await spec.fetch({ integration, credentialId: credential.id }, fetchApi, env),
    );
    return { id: spec.id, label: spec.label, ...body };
  }
  return {
    id: spec.id,
    label: spec.label,
    status: "unavailable",
    detail: "No credential in OpenCode",
    planLabel: null,
    windows: [],
    balances: [],
    details: [],
  };
}

export async function readLiveUsage(
  now: number = Date.now(),
  fetchApi: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LiveUsage> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.usage;
  const providers = await Promise.all(
    PROVIDERS.map((spec) => readProvider(spec, fetchApi, env)),
  );
  const usage = { fetchedAt: now, providers };
  cached = { at: now, usage };
  return usage;
}

/** Test seam: drops the shared reading. */
export function resetLiveUsageCache(): void {
  cached = null;
}
