import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fetchMinimaxUsage, resetMinimaxWindowDurations } from "./minimax.js";
import { fetchDeepseekUsage } from "./deepseek.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencode-minimax-"));
  resetMinimaxWindowDurations();
});

afterEach(async () => {
  await import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true, force: true }));
});

async function writeStore(value: unknown, integration: "minimax-cn-coding-plan" | "deepseek") {
  const directory = join(home, ".local", "share", "opencode");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "auth.json"), JSON.stringify({ [integration]: value }));
  return { integration, credentialId: integration };
}

test("reports the coding plan window as used percent", async () => {
  const input = await writeStore(
    { type: "api", key: "fixture-key" },
    "minimax-cn-coding-plan",
  );

  const report = await fetchMinimaxUsage(input, async (url, init) => {
    expect(String(url)).toBe("https://api.minimaxi.com/v1/token_plan/remains");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-key");
    return Response.json({
      model_remains: [
        {
          model_name: "general",
          start_time: 1793707200000,
          end_time: 1793721600000,
          remains_time: 14318767,
          current_interval_status: 1,
          current_interval_remaining_percent: 43,
          current_weekly_status: 3,
          current_weekly_remaining_percent: 100,
        },
      ],
    });
  }, { HOME: home });

  expect(report).toMatchObject({
    status: "available",
    planLabel: "Coding Plan",
  });
  if (report.status !== "available") throw new Error("expected a report");
  expect(report.windows).toHaveLength(1);
  expect(report.windows[0]).toMatchObject({ usedPct: 57 });
  expect(report.windows[0]?.label).toContain("hour");
});

test("a weekly window the plan does not use is left out", async () => {
  const input = await writeStore({ type: "api", key: "fixture-key" }, "minimax-cn-coding-plan");

  const report = await fetchMinimaxUsage(input, async () =>
    Response.json({
      model_remains: [
        {
          model_name: "general",
          current_interval_status: 1,
          current_interval_remaining_percent: 98,
          current_weekly_status: 3,
          current_weekly_remaining_percent: 100,
        },
      ],
    }),
    { HOME: home },
  );

  expect(report).toMatchObject({ status: "available" });
  if (report.status !== "available") throw new Error("expected a report");
  expect(report.windows.map((window) => window.id)).toEqual(["interval"]);
});

test("reports the DeepSeek balance", async () => {
  const input = await writeStore({ type: "api", key: "fixture-key" }, "deepseek");

  const report = await fetchDeepseekUsage(input, async (url, init) => {
    expect(String(url)).toBe("https://api.deepseek.com/user/balance");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer fixture-key");
    return Response.json({
      is_available: true,
      balance_infos: [{ currency: "CNY", total_balance: "27.32", topped_up_balance: "27.32" }],
    });
  }, { HOME: home });

  expect(report).toMatchObject({
    status: "available",
    balances: [{ id: "balance", remaining: 27.32, unit: "credits" }],
  });
});

test("the window keeps the length the plan gives it", async () => {
  const input = await writeStore(
    { type: "api", key: "fixture-key" },
    "minimax-cn-coding-plan",
  );

  const read = async (start: number, end: number) => {
    const report = await fetchMinimaxUsage(
      input,
      async () =>
        Response.json({
          model_remains: [
            {
              model_name: "general",
              start_time: start,
              end_time: end,
              current_interval_status: 1,
              current_interval_remaining_percent: 50,
              current_weekly_status: 3,
            },
          ],
        }),
      { HOME: home },
    );
    if (report.status !== "available") throw new Error("expected a report");
    return report.windows[0]?.label ?? "";
  };

  // A window that has been running reports less time than it has.
  expect(await read(0, 4 * 3_600_000)).toBe("4-hour");
  // The plan's window is five hours; once seen, that is the name it keeps.
  expect(await read(0, 5 * 3_600_000)).toBe("5-hour");
  expect(await read(0, 4 * 3_600_000)).toBe("5-hour");
});
