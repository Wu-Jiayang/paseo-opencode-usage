# OpenCode Usage

A Paseo plugin that reports the plan usage of the providers you signed in to inside OpenCode: the ChatGPT subscription behind Codex, the MiniMax coding plan, and the DeepSeek balance.

OpenChamber shows the same numbers in its session panel. This plugin brings them to Paseo's own Usage surfaces instead of a second UI.

## What it shows

| Source | Where the credential comes from | What it reports |
| --- | --- | --- |
| Codex (OpenCode) | OpenCode's `openai` credential | five hour and weekly windows, credit balance, plan |
| MiniMax Coding Plan | OpenCode's `minimax-coding-plan` / `minimax-cn-coding-plan` credential | interval window, weekly window when the plan has one |
| DeepSeek | OpenCode's `deepseek` credential | remaining balance |

Every source shows up in Settings → Usage as its own card.

## The live sidebar row

The Usage page reads Paseo's own usage report cache, which the daemon holds for five minutes. The plugin also adds a sidebar footer row that polls the providers through its own RPC, so its numbers move faster than that cache.

Two layouts are available in Settings → Plugins → OpenCode usage:

- **Detailed** (default): one line per provider, with the provider name, every window's share, its balance, and a bar under the line for the window closest to its limit.
- **Compact**: one line for all three providers, with the number closest to a limit for each.

Clicking the row opens a popover with the full picture: a card per provider with the plan, a bar and a percentage for every window, the reset countdown, the balances and the account details, plus a button that refreshes on demand.

The refresh interval is set in the same place: 15 seconds, 30 seconds, a minute, three minutes (default), or five minutes. The plugin keeps a ten-second shared reading on the daemon, so several clients polling at once cost one request.

The Usage page itself keeps Paseo's five-minute cache. Nothing a plugin does can shorten it.

## Credentials

OpenCode v2 owns every credential and stores it in `~/.local/share/opencode/opencode.db`. The plugin reads that database read-only with `node:sqlite`, and falls back to the v1 file `~/.local/share/opencode/auth.json` for a login the database never received. When both hold the same integration, the database wins, because the v1 file is the store that goes stale.

Nothing is written back. Each credential is sent only to the provider that issued it, and no credential appears in a usage report or in a plugin input.

Paths follow OpenCode: `OPENCODE_DB` overrides the database (a relative path resolves inside OpenCode's data directory), and `XDG_DATA_HOME` moves the data directory.

## Install

```bash
paseo plugin install git:WU-Jiayang/paseo-opencode-usage
```

Requires Paseo 0.14 or newer on the daemon, and Node 22.5 or newer for the database reader.

## Development

```bash
npm install
npm test          # vitest, 22 cases
npm run typecheck
```

The plugin has no runtime dependencies. Paseo provides the plugin SDK and zod at runtime.

## Publish to the Paseo registry

The registry lists plugins from reviewed Git repositories. Submit this repository through the
[plugin submission form](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml)
with the source URL and the categories it belongs to.

## Layout

```
index.server.ts            registers the usage sources, the settings and the live RPC
index.client.tsx           registers the sidebar row and the settings screen
server/opencode-store.ts   reads the OpenCode database and the v1 file
server/accounts.ts         turns credentials into usage accounts
server/codex.ts            ChatGPT usage endpoint
server/minimax.ts          MiniMax token plan endpoint
server/deepseek.ts         DeepSeek balance endpoint
server/live.ts             the live reading behind the sidebar row
client/live.tsx            the sidebar row and its popover
client/format.ts           the number, money and countdown formatting
client/settings.tsx        the refresh interval and layout settings
shared/input.ts            the discovery input schema
shared/live.ts              the live RPC contract
shared/preferences.ts       the plugin settings
```
