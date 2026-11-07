import {
  toneFromUsedPct,
  unavailable,
  windowFromReportedDuration,
  type UsageReport,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import { z } from "zod";
import { readCredential } from "./opencode-store.js";
import type { CredentialInput } from "../shared/input.js";

const TEXT_MODELS = ["general", "chat", "text"];

const modelRemainsSchema = z.object({
  model_name: z.string().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
  remains_time: z.number().optional(),
  current_interval_total_count: z.number().optional(),
  current_interval_usage_count: z.number().optional(),
  current_interval_status: z.number().optional(),
  current_interval_remaining_percent: z.number().optional(),
  current_weekly_total_count: z.number().optional(),
  current_weekly_usage_count: z.number().optional(),
  current_weekly_status: z.number().optional(),
  current_weekly_remaining_percent: z.number().optional(),
  weekly_start_time: z.number().optional(),
  weekly_end_time: z.number().optional(),
  weekly_remains_time: z.number().optional(),
});

const responseSchema = z.object({
  model_remains: z.array(modelRemainsSchema).optional(),
});

type ModelRemains = z.infer<typeof modelRemainsSchema>;

/** MiniMax reports status 3 for a window that does not apply to the plan. */
const WINDOW_INACTIVE = 3;

function endpoint(integration: CredentialInput["integration"]): string {
  return integration === "minimax-coding-plan"
    ? "https://api.minimax.io/v1/token_plan/remains"
    : "https://api.minimaxi.com/v1/token_plan/remains";
}

/**
 * MiniMax reports one entry per model. The text models share the coding plan
 * window, so the general entry is the one the plan percentage comes from.
 */
function pickEntry(entries: ModelRemains[]): ModelRemains | null {
  if (entries.length === 0) return null;
  const minimax = entries.find(
    (entry) => entry.model_name && /^minimax-m/i.test(entry.model_name),
  );
  if (minimax) return minimax;
  const text = entries.find(
    (entry) => entry.model_name && TEXT_MODELS.includes(entry.model_name.toLowerCase()),
  );
  if (text) return text;
  const withPercent = entries.find(
    (entry) => typeof entry.current_interval_remaining_percent === "number",
  );
  return withPercent ?? entries[0] ?? null;
}

/**
 * The length the provider reports for a window shrinks as the window runs,
 * but the plan's window has a fixed length: the longest length seen for a
 * window is the one that names it, so the label does not drift from "5-hour"
 * to "4-hour" while the window is running.
 */
const windowDurations = new Map<string, number>();

function durationHint(key: string, observed: number | null): number | null {
  const known = windowDurations.get(key);
  if (observed !== null && Number.isFinite(observed) && observed > 0) {
    if (known === undefined || observed > known) windowDurations.set(key, observed);
    return windowDurations.get(key) ?? observed;
  }
  return known ?? null;
}

/** The span between two epoch milliseconds, in seconds. */
function span(startTime: number | undefined, endTime: number | undefined): number | null {
  if (startTime === undefined || endTime === undefined) return null;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (endTime <= startTime) return null;
  return Math.floor((endTime - startTime) / 1000);
}

/** Test seam: forgets the observed window lengths. */
export function resetMinimaxWindowDurations(): void {
  windowDurations.clear();
}

function windowFromRemains(input: {
  id: string;
  label: string;
  shortLabel: string;
  usedPct: number | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  remainsTime: number | undefined;
  durationSeconds: number | null;
  resetsAt: string | null;
}): UsageWindow {
  return windowFromReportedDuration({
    durationSeconds: input.durationSeconds,
    unknown: { id: input.id, label: input.label, shortLabel: input.shortLabel },
    utilizationPct: input.usedPct,
    resetsAt: input.resetsAt,
    tone: toneFromUsedPct(input.usedPct),
  });
}

export async function fetchMinimaxUsage(
  input: CredentialInput,
  fetchApi: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageReport> {
  const credential = await readCredential(input.integration, input.credentialId, env);
  if (!credential) throw new Error("OpenCode login store no longer exists");
  if (!credential.key) throw new Error("OpenCode login has no MiniMax key");

  const response = await fetchApi(endpoint(input.integration), {
    headers: {
      Authorization: `Bearer ${credential.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    return unavailable({ kind: "rejected", status: response.status, refreshedBy: "opencode" });
  }
  if (!response.ok) throw new Error(`MiniMax usage API returned ${response.status}`);
  const payload = responseSchema.parse(await response.json());
  const entry = pickEntry(payload.model_remains ?? []);
  if (!entry) throw new Error("MiniMax usage API returned no model windows");

  const windows: UsageWindow[] = [];
  const intervalStatus = entry.current_interval_status;
  if (intervalStatus !== WINDOW_INACTIVE) {
    windows.push(
      windowFromRemains({
        id: "interval",
        label: "Coding plan",
        shortLabel: "",
        usedPct:
          typeof entry.current_interval_remaining_percent === "number"
            ? 100 - entry.current_interval_remaining_percent
            : undefined,
        startTime: entry.start_time,
        endTime: entry.end_time,
        remainsTime: entry.remains_time,
        durationSeconds: durationHint(
          `${input.integration}:interval`,
          span(entry.start_time, entry.end_time),
        ),
        resetsAt: resetAt(entry.end_time, entry.remains_time),
      }),
    );
  }
  const weeklyStatus = entry.current_weekly_status;
  if (weeklyStatus !== WINDOW_INACTIVE) {
    windows.push(
      windowFromRemains({
        id: "weekly",
        label: "Weekly",
        shortLabel: "wk",
        usedPct:
          typeof entry.current_weekly_remaining_percent === "number"
            ? 100 - entry.current_weekly_remaining_percent
            : undefined,
        startTime: entry.weekly_start_time,
        endTime: entry.weekly_end_time,
        remainsTime: entry.weekly_remains_time,
        durationSeconds: durationHint(
          `${input.integration}:weekly`,
          span(entry.weekly_start_time, entry.weekly_end_time),
        ),
        resetsAt: resetAt(entry.weekly_end_time, entry.weekly_remains_time),
      }),
    );
  }

  return {
    status: "available",
    planLabel: "Coding Plan",
    windows,
  };
}

function resetAt(endTime: number | undefined, remainsTime: number | undefined): string | null {
  if (endTime) return new Date(endTime).toISOString();
  if (remainsTime) return new Date(Date.now() + remainsTime).toISOString();
  return null;
}
