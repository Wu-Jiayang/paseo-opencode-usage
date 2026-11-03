import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { fetchCodexUsage } from "./codex.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencode-codex-"));
});

afterEach(async () => {
  await import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true, force: true }));
});

async function writeStore(value: unknown) {
  const directory = join(home, ".local", "share", "opencode");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "auth.json"), JSON.stringify({ openai: value }));
  return { integration: "openai" as const, credentialId: "openai" };
}

test("reports the five hour and weekly windows with the credit balance", async () => {
  const input = await writeStore({
    type: "oauth",
    access: "fixture-access",
    expires: Date.now() + 60_000,
    accountId: "account-1",
  });

  const report = await fetchCodexUsage(input, async (url, init) => {
    expect(String(url)).toBe("https://chatgpt.com/backend-api/wham/usage");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fixture-access");
    expect(headers.get("ChatGPT-Account-Id")).toBe("account-1");
    return Response.json({
      plan_type: "plus",
      email: "owner@example.test",
      rate_limit: {
        primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1700000000 },
        secondary_window: { used_percent: 81, limit_window_seconds: 604800 },
      },
      credits: { balance: 4 },
    });
  }, { HOME: home });

  expect(report).toMatchObject({
    status: "available",
    planLabel: "plus",
    windows: [
      { id: "five_hour", usedPct: 12 },
      { id: "weekly", usedPct: 81 },
    ],
    balances: [{ id: "credits", remaining: 4, unit: "credits" }],
    details: [{ id: "email", value: "owner@example.test" }],
  });
});

test("an expired token is unavailable without a request", async () => {
  const input = await writeStore({
    type: "oauth",
    access: "fixture-access",
    expires: Date.now() - 1000,
  });

  const report = await fetchCodexUsage(
    input,
    async () => {
      throw new Error("must not fetch an expired token");
    },
    { HOME: home },
  );
  expect(report).toMatchObject({
    status: "unavailable",
    problem: { kind: "expired", refreshedBy: "opencode" },
  });
});

test("a rejected token is unavailable", async () => {
  const input = await writeStore({ type: "oauth", access: "fixture-access" });

  const report = await fetchCodexUsage(
    input,
    async () => new Response(null, { status: 401 }),
    { HOME: home },
  );
  expect(report).toEqual({
    status: "unavailable",
    problem: { kind: "rejected", status: 401, refreshedBy: "opencode" },
  });
});
