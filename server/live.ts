import type { UsageReport } from "@getpaseo/plugin/server/usage";
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

interface ProviderBody {
  status: LiveProvider["status"];
  detail: string | null;
  windows: LiveProvider["windows"];
  balances: LiveProvider["balances"];
}

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
    label: "MiniMax Coding Plan",
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

function emptyBody(status: LiveProvider["status"], detail: string | null): ProviderBody {
  return { status, detail, windows: [], balances: [] };
}

function describe(report: UsageReport): ProviderBody {
  if (report.status === "error") return emptyBody("error", report.error);
  if (report.status === "unavailable") {
    const problem = report.problem;
    if (problem.kind === "expired") {
      return emptyBody("unavailable", `Login expired at ${problem.expiresAt}`);
    }
    if (problem.kind === "rejected") {
      return emptyBody("unavailable", `Login rejected (HTTP ${problem.status})`);
    }
    return emptyBody("unavailable", problem.detail);
  }
  return {
    status: "available",
    detail: null,
    windows: report.windows.map((window) => ({
      id: window.id,
      label: window.label,
      usedPct: window.usedPct ?? null,
      resetsAt: window.resetsAt ?? null,
    })),
    balances: (report.balances ?? []).map((balance) => ({
      label: balance.label,
      remaining: balance.remaining ?? null,
      unit: balance.unit,
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
    ...emptyBody("unavailable", "No credential in OpenCode"),
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
