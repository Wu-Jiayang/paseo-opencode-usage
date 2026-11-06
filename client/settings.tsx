import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsSelect,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { preferences, type Preferences } from "../shared/preferences";

const REFRESH_OPTIONS = [
  { value: "15", label: "Every 15 seconds" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "300", label: "Every 5 minutes" },
];

export function makeSettingsScreen(): ComponentType<PluginSurfaceProps> {
  return function OpenCodeUsageSettings({ theme }: PluginSurfaceProps) {
    const settings = useSettings(preferences);
    const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
    if (settings.status === "loading") {
      return <Text style={muted}>Loading settings...</Text>;
    }
    if (settings.status === "error" || settings.status === "invalid") {
      return (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{settings.error}</Text>
        </View>
      );
    }
    const values = settings.values;
    const save = (patch: Partial<Preferences>) => {
      void settings.save({ ...values, ...patch }, settings.revision).then((ok) => {
        if (!ok) void settings.reload();
      });
    };
    return (
      <View style={{ gap: 16 }}>
        <SettingsSection title="Live sidebar row">
          <SettingsCard>
            <SettingsSwitch
              label="Show usage in the sidebar footer"
              hint="Polls the provider quotas directly, so the numbers move faster than the Usage page cache."
              value={values.showInFooter}
              onValueChange={(value: boolean) => save({ showInFooter: value })}
            />
            <SettingsSelect
              label="Refresh interval"
              hint="How often the row asks the providers for fresh numbers."
              value={String(values.refreshSeconds)}
              options={REFRESH_OPTIONS}
              onValueChange={(value: string) => save({ refreshSeconds: Number(value) as Preferences["refreshSeconds"] })}
            />
          </SettingsCard>
        </SettingsSection>
      </View>
    );
  };
}
