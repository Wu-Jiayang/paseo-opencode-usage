import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LiveUsageItem } from "./client/live";
import { makeSettingsScreen } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  client.addSidebarFooterItem({
    id: "opencode-usage",
    title: "OpenCode usage",
    Component: LiveUsageItem,
  });
  client.addSettingsScreen({
    id: "opencode-usage",
    title: "OpenCode usage",
    icon: "Gauge",
    Component: makeSettingsScreen(),
  });
  return () => {};
}
