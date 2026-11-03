import type { PluginServerContext } from "@getpaseo/plugin/server";
import { credentialInputSchema } from "./shared/input.js";
import { discoverAccounts } from "./server/accounts.js";
import { fetchCodexUsage } from "./server/codex.js";
import { fetchMinimaxUsage } from "./server/minimax.js";
import { fetchDeepseekUsage } from "./server/deepseek.js";

export default function contribute(server: PluginServerContext) {
  server.registerUsageSource({
    id: "opencode-codex",
    label: "Codex (OpenCode)",
    input: credentialInputSchema,
    discover: (scope) => discoverAccounts(["openai"], scope),
    fetch: fetchCodexUsage,
  });
  server.registerUsageSource({
    id: "opencode-minimax",
    label: "MiniMax Coding Plan",
    input: credentialInputSchema,
    discover: (scope) =>
      discoverAccounts(["minimax-cn-coding-plan", "minimax-coding-plan"], scope),
    fetch: fetchMinimaxUsage,
  });
  server.registerUsageSource({
    id: "opencode-deepseek",
    label: "DeepSeek",
    input: credentialInputSchema,
    discover: (scope) => discoverAccounts(["deepseek"], scope),
    fetch: fetchDeepseekUsage,
  });
  return () => {};
}
