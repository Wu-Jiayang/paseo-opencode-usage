# OpenCode Usage

A Paseo plugin that reports the plan usage of the providers you signed in to inside OpenCode: the ChatGPT subscription behind Codex, the MiniMax coding plan, and the DeepSeek balance.

OpenChamber shows the same numbers in its session panel. This plugin brings them to Paseo's own Usage surfaces instead of a second UI.

## What it shows

| Source | Where the credential comes from | What it reports |
| --- | --- | --- |
| Codex (OpenCode) | OpenCode's `openai` credential | five hour and weekly windows, credit balance, plan |
| MiniMax Coding Plan | OpenCode's `minimax-coding-plan` / `minimax-cn-coding-plan` credential | interval window, weekly window when the plan has one |
| DeepSeek | OpenCode's `deepseek` credential | remaining balance |

Every source shows up in Settings → Usage as its own card, and the same numbers feed the usage meter in the composer.

## Credentials

OpenCode v2 owns every credential and stores it in `~/.local/share/opencode/opencode.db`. The plugin reads that database read-only with `node:sqlite`, and falls back to the v1 file `~/.local/share/opencode/auth.json` for a login the database never received. When both hold the same integration, the database wins, because the v1 file is the store that goes stale.

Nothing is written back. Each credential is sent only to the provider that issued it, and no credential appears in a usage report or in a plugin input.

Paths follow OpenCode: `OPENCODE_DB` overrides the database (a relative path resolves inside OpenCode's data directory), and `XDG_DATA_HOME` moves the data directory.

## Install

```bash
paseo plugin install /path/to/opencode-usage
```

Requires Paseo 0.14 or newer on the daemon, and Node 22.5 or newer for the database reader.

## Development

```bash
npm install
npm test          # vitest, 13 cases
npm run typecheck
```

The plugin has no runtime dependencies. Paseo provides the plugin SDK and zod at runtime.

## Layout

```
index.server.ts        registers the three usage sources
server/opencode-store.ts   reads the OpenCode database and the v1 file
server/accounts.ts     turns credentials into usage accounts
server/codex.ts        ChatGPT usage endpoint
server/minimax.ts      MiniMax token plan endpoint
server/deepseek.ts     DeepSeek balance endpoint
shared/input.ts        the discovery input schema
```
