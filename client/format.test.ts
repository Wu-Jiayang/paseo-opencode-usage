import { describe, expect, test } from "vitest";
import {
  clampPct,
  formatBalance,
  formatNumber,
  percentText,
  providerHeadline,
  resetCountdown,
  tightestWindow,
  toneFromUsedPct,
} from "./format";
import type { LiveBalance, LiveProvider } from "../shared/live";

function balance(overrides: Partial<LiveBalance> = {}): LiveBalance {
  return {
    id: "balance",
    label: "余额 (CNY)",
    used: null,
    remaining: 22.67,
    limit: null,
    unit: "credits",
    currency: "CNY",
    tone: "ok",
    ...overrides,
  };
}

function provider(overrides: Partial<LiveProvider> = {}): LiveProvider {
  return {
    id: "codex",
    label: "Codex",
    status: "available",
    detail: null,
    planLabel: "plus",
    windows: [],
    balances: [],
    details: [],
    ...overrides,
  };
}

describe("format", () => {
  test("percentages round and clamp", () => {
    expect(percentText(91.6)).toBe("92%");
    expect(percentText(null)).toBe("-");
    expect(clampPct(120)).toBe(100);
    expect(clampPct(-4)).toBe(0);
  });

  test("tones follow the used share", () => {
    expect(toneFromUsedPct(10)).toBe("ok");
    expect(toneFromUsedPct(70)).toBe("warning");
    expect(toneFromUsedPct(95)).toBe("danger");
    expect(toneFromUsedPct(null)).toBe("default");
  });

  test("balances carry their currency", () => {
    expect(formatBalance(balance())).toBe("¥22.67");
    expect(formatBalance(balance({ currency: "USD" }))).toBe("$22.67");
    expect(formatBalance(balance({ currency: null, unit: "usd" }))).toBe("$22.67");
    expect(formatBalance(balance({ currency: null, remaining: 0 }))).toBe("0 cr");
    expect(formatNumber(22)).toBe("22");
  });

  test("reset countdowns shrink to the shortest unit", () => {
    const now = Date.now();
    expect(resetCountdown(new Date(now + 30 * 60_000).toISOString(), now)).toBe("30m");
    expect(resetCountdown(new Date(now + 5 * 3_600_000).toISOString(), now)).toBe("5h");
    expect(resetCountdown(new Date(now - 1000).toISOString(), now)).toBe("resetting");
    expect(resetCountdown(null, now)).toBeNull();
  });

  test("the tightest window wins the headline", () => {
    const usage = provider({
      windows: [
        { id: "a", label: "5-hour", shortLabel: "5h", usedPct: 40, remainingPct: 60, resetsAt: null, tone: "ok" },
        { id: "b", label: "Weekly", shortLabel: "wk", usedPct: 80, remainingPct: 20, resetsAt: null, tone: "warning" },
      ],
    });
    expect(tightestWindow(usage)?.id).toBe("b");
    expect(providerHeadline(usage)).toBe("80%");
  });

  test("a provider without a window falls back to its balance", () => {
    const usage = provider({ id: "deepseek", balances: [balance()] });
    expect(providerHeadline(usage)).toBe("¥22.67");
  });
});
