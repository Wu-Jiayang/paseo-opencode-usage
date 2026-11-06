import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { liveUsageRpc, type LiveProvider, type LiveUsage } from "../shared/live";
import { preferences } from "../shared/preferences";

const ICON_SIZE = 14;
const FONT_SIZE = 12;
const ICON_GAP = 6;
const ITEM_GAP = 10;

const ICONS: Record<LiveProvider["id"], string> = {
  codex: "Bot",
  minimax: "Zap",
  deepseek: "Waves",
};

type Severity = "ok" | "warning" | "danger";

function severity(usedPct: number | null): Severity {
  if (usedPct === null) return "ok";
  if (usedPct >= 90) return "danger";
  if (usedPct >= 70) return "warning";
  return "ok";
}

function severityColor(theme: PluginTheme, level: Severity): string {
  if (level === "danger") return theme.colors.statusDanger;
  if (level === "warning") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

/** The window closest to its limit is the one worth the single number. */
function tightestWindow(provider: LiveProvider): { label: string; usedPct: number | null } | null {
  const windows = provider.windows.filter((window) => window.usedPct !== null);
  if (windows.length === 0) return null;
  const tightest = windows.reduce((worst, window) =>
    (window.usedPct ?? 0) > (worst.usedPct ?? 0) ? window : worst,
  );
  return { label: tightest.label, usedPct: tightest.usedPct };
}

function balanceText(provider: LiveProvider): string | null {
  const balance = provider.balances[0];
  if (!balance || balance.remaining === null) return null;
  const amount =
    balance.unit === "usd" ? `$${balance.remaining.toFixed(2)}` : `${balance.remaining.toFixed(2)}`;
  return balance.unit === "usd" ? amount : `${amount} CNY`;
}

function percentText(usedPct: number): string {
  return `${Math.round(usedPct)}%`;
}

export function useLiveUsage() {
  const getLive = useRpc(liveUsageRpc);
  const settings = useSettings(preferences);
  const ready = settings.status === "ready";
  const refreshSeconds = ready ? settings.values.refreshSeconds : 180;
  const enabled = ready ? settings.values.showInFooter : true;
  return useQuery({
    queryKey: ["opencode-usage", "live"],
    queryFn: () => getLive({}),
    refetchInterval: refreshSeconds * 1000,
    enabled,
  });
}

export function LiveUsageItem({ theme, openPopover }: PluginSidebarItemProps) {
  const { data } = useLiveUsage();
  if (!data) return null;
  const items = data.providers
    .map((provider) => {
      const window = tightestWindow(provider);
      const balance = balanceText(provider);
      if (!window && !balance) return null;
      const value = window ? percentText(window.usedPct ?? 0) : (balance ?? "");
      return { provider, value, level: severity(window?.usedPct ?? null) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  if (items.length === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`OpenCode usage: ${items
        .map((item) => `${item.provider.label} ${item.value}`)
        .join(", ")}`}
      onPress={() => openPopover(LiveUsagePopover)}
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        minHeight: 28,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {items.map((item, index) => (
        <View
          key={item.provider.id}
          style={{ flexDirection: "row", alignItems: "center", marginLeft: index === 0 ? 0 : ICON_GAP }}
        >
          <Icon
            name={ICONS[item.provider.id]}
            size={ICON_SIZE}
            color={theme.colors.foregroundMuted}
          />
          <Text
            numberOfLines={1}
            style={{
              color: severityColor(theme, item.level),
              fontSize: FONT_SIZE,
              fontVariant: ["tabular-nums" as const],
              marginLeft: 4,
            }}
          >
            {item.value}
          </Text>
          {index < items.length - 1 ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE, marginLeft: ITEM_GAP }}>
              ·
            </Text>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}

function resetText(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const remaining = new Date(resetsAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.round(remaining / 60_000);
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `resets in ${hours}h`;
}

function ProviderRow({ theme, provider, now }: { theme: PluginTheme; provider: LiveProvider; now: number }) {
  const muted = { color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 1 };
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ICON_GAP }}>
        <Icon name={ICONS[provider.id]} size={ICON_SIZE} color={theme.colors.foregroundMuted} />
        <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: FONT_SIZE }}>
          {provider.label}
        </Text>
        {provider.status !== "available" ? (
          <Text style={{ color: theme.colors.statusWarning, fontSize: FONT_SIZE - 1 }}>
            {provider.detail ?? "unavailable"}
          </Text>
        ) : null}
      </View>
      {provider.windows.map((window) => (
        <View
          key={window.id}
          style={{ flexDirection: "row", alignItems: "center", paddingLeft: ICON_SIZE + ICON_GAP }}
        >
          <Text style={{ flex: 1, ...muted }}>{window.label}</Text>
          {window.usedPct !== null ? (
            <Text
              style={{
                color: severityColor(theme, severity(window.usedPct)),
                fontSize: FONT_SIZE,
                fontVariant: ["tabular-nums" as const],
              }}
            >
              {percentText(window.usedPct)}
            </Text>
          ) : null}
          {resetText(window.resetsAt, now) ? (
            <Text style={{ ...muted, marginLeft: 8 }}>{resetText(window.resetsAt, now)}</Text>
          ) : null}
        </View>
      ))}
      {provider.balances.map((balance) => (
        <View
          key={balance.label}
          style={{ flexDirection: "row", alignItems: "center", paddingLeft: ICON_SIZE + ICON_GAP }}
        >
          <Text style={{ flex: 1, ...muted }}>{balance.label}</Text>
          <Text style={{ color: theme.colors.foreground, fontSize: FONT_SIZE }}>
            {balance.remaining === null ? "-" : balance.remaining.toFixed(2)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LiveUsagePopover({ theme, layout }: PluginPopoverProps) {
  const { data } = useLiveUsage();
  const rootStyle = {
    gap: 10,
    padding: layout.compact ? 16 : 12,
    minWidth: 240,
    backgroundColor: theme.colors.surface1,
  };
  if (!data) {
    return (
      <View style={rootStyle}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE }}>Loading...</Text>
      </View>
    );
  }
  const now = Date.now();
  const age = Math.max(0, Math.round((now - data.fetchedAt) / 1000));
  return (
    <View style={rootStyle}>
      {data.providers.map((provider) => (
        <ProviderRow key={provider.id} theme={theme} provider={provider} now={now} />
      ))}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 1 }}>
        updated {age}s ago
      </Text>
    </View>
  );
}

export type { LiveUsage };
