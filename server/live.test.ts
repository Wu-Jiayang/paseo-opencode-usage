import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { readLiveUsage, resetLiveUsageCache } from "./live.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencode-live-"));
  resetLiveUsageCache();
});

afterEach(async () => {
  await import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true, force: true }));
});

async function writeStore(entries: Record<string, unknown>) {
  const directory = join(home, ".local", "share", "opencode");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "auth.json"), JSON.stringify(entries));
}

test("reads the three providers in one pass", async () => {
  await writeStore({
    openai: { type: "oauth", access: "fixture-access", expires: Date.now() + 60_000 },
    "minimax-cn-coding-plan": { type: "api", key: "fixture-key" },
    deepseek: { type: "api", key: "fixture-key" },
  });

  const usage = await readLiveUsage(
    Date.now(),
    async (url) => {
      const target = String(url);
      if (target.includes("wham/usage")) {
        return Response.json({
          plan_type: "plus",
          rate_limit: {
            primary_window: { used_percent: 44, limit_window_seconds: 18000 },
            secondary_window: { used_percent: 89, limit_window_seconds: 604800 },
          },
        });
      }
      if (target.includes("token_plan")) {
        return Response.json({
          model_remains: [
            {
              model_name: "general",
              current_interval_status: 1,
              current_interval_remaining_percent: 61,
              current_weekly_status: 3,
            },
          ],
        });
      }
      return Response.json({
        balance_infos: [{ currency: "CNY", total_balance: "27.21" }],
      });
    },
    { HOME: home },
  );

  expect(usage.providers.map((provider) => provider.id)).toEqual(["codex", "minimax", "deepseek"]);
  const codex = usage.providers[0]!;
  expect(codex.status).toBe("available");
  expect(codex.windows.map((window) => window.usedPct)).toEqual([44, 89]);
  const minimax = usage.providers[1]!;
  expect(minimax.windows[0]?.usedPct).toBe(39);
  const deepseek = usage.providers[2]!;
  expect(deepseek.balances[0]?.remaining).toBe(27.21);
});

test("a provider without a credential is reported instead of skipped", async () => {
  await writeStore({ deepseek: { type: "api", key: "fixture-key" } });

  const usage = await readLiveUsage(
    Date.now(),
    async () => Response.json({ balance_infos: [{ currency: "CNY", total_balance: "1.00" }] }),
    { HOME: home },
  );

  const codex = usage.providers.find((provider) => provider.id === "codex");
  expect(codex?.status).toBe("unavailable");
  expect(codex?.detail).toBe("No credential in OpenCode");
});
