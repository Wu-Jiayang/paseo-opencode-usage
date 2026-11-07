import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { liveUsageRpc, type LiveProvider, type LiveTone, type LiveUsage } from "../shared/live";
import { preferences } from "../shared/preferences";
import {
  clampPct,
  formatBalance,
  percentText,
  providerHeadline,
  resetCountdown,
  toneColor,
  valueColor,
} from "./format";

const ICON_SIZE = 14;
const FONT_SIZE = 12;
const ICON_GAP = 6;
const ITEM_GAP = 10;

const ICONS: Record<LiveProvider["id"], string> = {
  codex: "Bot",
  minimax: "Zap",
  deepseek: "Waves",
};

/** The width the provider name takes in a detailed row, so the values line up. */
const NAME_WIDTH = 62;

/** A window's share as a bar, coloured by its tone. The caller sizes the track. */
function Meter({
  theme,
  percent,
  tone,
  height = 5,
  style,
}: {
  theme: PluginTheme;
  percent: number;
  tone: LiveTone;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: theme.colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View
        style={{
          width: `${clampPct(percent)}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: toneColor(theme, tone),
        }}
      />
    </View>
  );
}

export function useLiveUsage() {
  const getLive = useRpc(liveUsageRpc);
  const settings = useSettings(preferences);
  const ready = settings.status === "ready";
  const refreshSeconds = ready ? settings.values.refreshSeconds : 180;
  const layout = ready ? settings.values.layout : "detailed";
  const enabled = ready ? settings.values.showInFooter : true;
  const query = useQuery({
    queryKey: ["opencode-usage", "live"],
    queryFn: () => getLive({}),
    refetchInterval: refreshSeconds * 1000,
    enabled,
  });
  return { ...query, refreshSeconds, layout };
}

/** One provider's number in a compact row. */
function Headline({ theme, provider }: { theme: PluginTheme; provider: LiveProvider }) {
  const window = provider.windows.find((entry) => entry.usedPct !== null);
  const tone = window?.tone ?? "default";
  const value = providerHeadline(provider);
  if (!value) return null;
  return (
    <Text
      numberOfLines={1}
      style={{
        color: valueColor(theme, tone),
        fontSize: FONT_SIZE,
        fontVariant: ["tabular-nums" as const],
        marginLeft: 4,
      }}
    >
      {value}
    </Text>
  );
}

/** The compact row: one number per provider, on one line. */
function CompactRow({ theme, providers }: { theme: PluginTheme; providers: LiveProvider[] }) {
  const items = providers.filter((provider) => providerHeadline(provider) !== null);
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
      {items.map((provider, index) => (
        <View
          key={provider.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginLeft: index === 0 ? 0 : ITEM_GAP,
          }}
        >
          <Icon name={ICONS[provider.id]} size={ICON_SIZE} color={theme.colors.foregroundMuted} />
          <Headline theme={theme} provider={provider} />
        </View>
      ))}
    </View>
  );
}

/** The detailed row: the provider's name, every window, and its balance. */
function DetailedRow({ theme, provider }: { theme: PluginTheme; provider: LiveProvider }) {
  const tightest = provider.windows.reduce<LiveProvider["windows"][number] | null>(
    (worst, window) =>
      (window.usedPct ?? -1) > (worst?.usedPct ?? -1) ? window : worst,
    null,
  );
  const windows = provider.windows.filter((window) => window.usedPct !== null);
  const balance = provider.balances[0];
  return (
    <View style={{ gap: 3, width: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
        <Icon name={ICONS[provider.id]} size={ICON_SIZE} color={theme.colors.foregroundMuted} />
        <Text
          numberOfLines={1}
          style={{
            width: NAME_WIDTH,
            marginLeft: ICON_GAP,
            color: theme.colors.foregroundMuted,
            fontSize: FONT_SIZE - 1,
          }}
        >
          {provider.label}
        </Text>
        {windows.map((window, index) => (
          <View
            key={window.id}
            style={{ flexDirection: "row", alignItems: "center", marginLeft: index === 0 ? 0 : 8 }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: valueColor(theme, window.tone),
                fontSize: FONT_SIZE,
                fontVariant: ["tabular-nums" as const],
              }}
            >
              {percentText(window.usedPct)}
            </Text>
            {window.shortLabel ? (
              <Text
                style={{
                  color: theme.colors.foregroundMuted,
                  fontSize: FONT_SIZE - 2,
                  marginLeft: 2,
                }}
              >
                {window.shortLabel}
              </Text>
            ) : null}
          </View>
        ))}
        {balance ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.foreground,
              fontSize: FONT_SIZE,
              fontVariant: ["tabular-nums" as const],
              marginLeft: 8,
            }}
          >
            {formatBalance(balance)}
          </Text>
        ) : null}
      </View>
      {tightest && tightest.usedPct !== null ? (
        <Meter
          theme={theme}
          percent={tightest.usedPct}
          tone={tightest.tone}
          height={3}
          style={{ width: "100%" }}
        />
      ) : null}
    </View>
  );
}

export function LiveUsageItem({ theme, openPopover }: PluginSidebarItemProps) {
  const { data, layout } = useLiveUsage();
  if (!data) return null;
  const providers = data.providers.filter(
    (provider) =>
      provider.status === "available" &&
      (provider.windows.length > 0 || provider.balances.length > 0),
  );
  if (providers.length === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`OpenCode usage: ${providers
        .map((provider) => `${provider.label} ${providerHeadline(provider) ?? ""}`)
        .join(", ")}`}
      onPress={() => openPopover(LiveUsagePopover)}
      style={({ pressed }) => ({
        width: "100%",
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        opacity: pressed ? 0.7 : 1,
        overflow: "hidden",
      })}
    >
      {layout === "compact" ? (
        <CompactRow theme={theme} providers={providers} />
      ) : (
        providers.map((provider) => (
          <DetailedRow key={provider.id} theme={theme} provider={provider} />
        ))
      )}
    </Pressable>
  );
}

/** A window in the popover: its name, its share, and when it resets. */
function WindowRow({
  theme,
  window,
  now,
}: {
  theme: PluginTheme;
  window: LiveProvider["windows"][number];
  now: number;
}) {
  const countdown = resetCountdown(window.resetsAt, now);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ width: 92, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 1 }}>
        {window.label}
      </Text>
      <Meter
        theme={theme}
        percent={window.usedPct ?? 0}
        tone={window.tone}
        style={{ flex: 1, minWidth: 40, marginRight: 0 }}
      />
      <Text
        style={{
          width: 36,
          textAlign: "right",
          color: valueColor(theme, window.tone),
          fontSize: FONT_SIZE,
          fontVariant: ["tabular-nums" as const],
        }}
      >
        {percentText(window.usedPct)}
      </Text>
      <Text
        style={{
          width: 52,
          textAlign: "right",
          color: theme.colors.foregroundMuted,
          fontSize: FONT_SIZE - 2,
        }}
      >
        {countdown ?? ""}
      </Text>
    </View>
  );
}

/** One provider's card in the popover. */
function ProviderCard({
  theme,
  provider,
  now,
}: {
  theme: PluginTheme;
  provider: LiveProvider;
  now: number;
}) {
  return (
    <View
      style={{
        gap: 6,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: ICON_GAP }}>
        <Icon name={ICONS[provider.id]} size={ICON_SIZE} color={theme.colors.foreground} />
        <Text style={{ color: theme.colors.foreground, fontSize: FONT_SIZE, fontWeight: "600" }}>
          {provider.label}
        </Text>
        {provider.planLabel ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 2 }}>
            {provider.planLabel}
          </Text>
        ) : null}
        {provider.status !== "available" ? (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "right",
              color: theme.colors.statusWarning,
              fontSize: FONT_SIZE - 2,
            }}
          >
            {provider.detail ?? "unavailable"}
          </Text>
        ) : null}
      </View>
      {provider.windows.map((window) => (
        <WindowRow key={window.id} theme={theme} window={window} now={now} />
      ))}
      {provider.balances.map((balance) => (
        <View key={balance.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 1 }}>
            {balance.label}
          </Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: FONT_SIZE,
              fontVariant: ["tabular-nums" as const],
            }}
          >
            {formatBalance(balance)}
          </Text>
        </View>
      ))}
      {provider.details.map((detail) => (
        <View key={detail.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 1 }}>
            {detail.label}
          </Text>
          <Text style={{ color: theme.colors.foreground, fontSize: FONT_SIZE - 1 }}>
            {detail.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LiveUsagePopover({ theme, layout }: PluginPopoverProps) {
  const { data, refreshSeconds, refetch, isFetching } = useLiveUsage();
  const rootStyle = {
    gap: 10,
    padding: layout.compact ? 16 : 14,
    width: layout.compact ? undefined : 340,
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
  const nextIn = Math.max(0, Math.round((data.fetchedAt + refreshSeconds * 1000 - now) / 1000));
  return (
    <View style={rootStyle}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: ICON_GAP }}>
        <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: FONT_SIZE + 1, fontWeight: "600" }}>
          OpenCode usage
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 2 }}>
          {age}s ago
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh usage now"
          onPress={() => void refetch()}
          style={({ pressed }) => ({ opacity: pressed || isFetching ? 0.5 : 1, padding: 2 })}
        >
          <Icon name="RefreshCw" size={13} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      {data.providers.map((provider) => (
        <ProviderCard key={provider.id} theme={theme} provider={provider} now={now} />
      ))}
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: FONT_SIZE - 2 }}>
        next refresh in {nextIn}s
      </Text>
    </View>
  );
}

export type { LiveUsage };
