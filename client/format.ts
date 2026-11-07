import type { PluginTheme } from "@getpaseo/plugin";
import type { LiveBalance, LiveProvider, LiveTone, LiveWindow } from "../shared/live";

/** A share of a limit, kept inside the bar that draws it. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

export function percentText(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "-";
  return `${Math.round(pct)}%`;
}

/** The severity of a window, from how much of it is used. */
export function toneFromUsedPct(usedPct: number | null | undefined): LiveTone {
  if (typeof usedPct !== "number" || !Number.isFinite(usedPct)) return "default";
  if (usedPct > 90) return "danger";
  if (usedPct >= 70) return "warning";
  return "ok";
}

/** The colour a tone paints with. */
export function toneColor(theme: PluginTheme, tone: LiveTone): string {
  switch (tone) {
    case "danger":
      return theme.colors.statusDanger;
    case "warning":
      return theme.colors.statusWarning;
    case "ok":
      return theme.colors.statusSuccess;
    default:
      return theme.colors.foregroundMuted;
  }
}

/**
 * The colour a number is written in. A healthy window stays in the plain
 * foreground so a row of numbers does not turn into a row of alerts; only a
 * window near its limit is coloured.
 */
export function valueColor(theme: PluginTheme, tone: LiveTone): string {
  if (tone === "warning" || tone === "danger") return toneColor(theme, tone);
  return theme.colors.foreground;
}

/** A number without trailing zeros: 27.67 stays, 22.0 becomes 22. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/** The amount a balance holds, in the unit it is reported in. */
export function formatBalance(balance: LiveBalance): string {
  const value = balance.remaining ?? balance.used ?? null;
  if (value === null || !Number.isFinite(value)) return "-";
  const amount = formatNumber(value);
  if (balance.currency === "CNY") return `¥${amount}`;
  if (balance.currency === "USD") return `$${amount}`;
  if (balance.unit === "usd") return `$${amount}`;
  if (balance.unit === "tokens") return `${amount} tokens`;
  if (balance.unit === "requests") return `${amount} req`;
  if (balance.unit === "credits") return `${amount} cr`;
  return amount;
}

/**
 * How long a window has left, in the shortest unit that still reads well.
 * A window whose reset time has passed is resetting.
 */
export function resetCountdown(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const at = new Date(resetsAt).getTime();
  if (!Number.isFinite(at)) return null;
  const remaining = at - now;
  if (remaining <= 0) return "resetting";
  const minutes = Math.max(1, Math.round(remaining / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** The window closest to its limit: the one worth the single number. */
export function tightestWindow(provider: LiveProvider): LiveWindow | null {
  const windows = provider.windows.filter(
    (window) => window.usedPct !== null && Number.isFinite(window.usedPct),
  );
  if (windows.length === 0) return null;
  return windows.reduce((worst, window) =>
    (window.usedPct ?? 0) > (worst.usedPct ?? 0) ? window : worst,
  );
}

/** The one number a compact row shows for a provider. */
export function providerHeadline(provider: LiveProvider): string | null {
  const window = tightestWindow(provider);
  if (window) return percentText(window.usedPct);
  const balance = provider.balances[0];
  if (balance) return formatBalance(balance);
  return null;
}
