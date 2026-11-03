# OpenCode Usage

Reads the plan usage of the providers you signed in to inside OpenCode and reports it in Paseo's Usage surfaces: the ChatGPT subscription behind Codex, the MiniMax coding plan, and the DeepSeek balance.

## How it works

OpenCode v2 keeps every provider credential in its own database. The plugin reads that database read-only, and falls back to the older credential file for a login the database never received. Each provider is then asked for its own quota:

- Codex: the ChatGPT usage endpoint, giving the five hour and weekly windows and the credit balance.
- MiniMax Coding Plan: the token plan endpoint, giving the interval window, and the weekly window when the plan has one.
- DeepSeek: the balance endpoint, giving the remaining balance.

## Setup

Nothing to configure. A source appears once OpenCode holds a login for it: the Codex source needs the ChatGPT login OpenCode stores, the MiniMax source needs a coding plan key, and the DeepSeek source needs a DeepSeek key. A credential the provider refuses shows as an unavailable card with the reason, not as a zero.

Requires Paseo 0.14 or newer, and Node 22.5 or newer for the database reader on the daemon host.

## Data access

The plugin reads local credential stores and never writes them. Each credential goes only to the provider that issued it. Credentials never appear in a usage report, in a plugin input, or in anything Paseo sends to a client.

## Limits

Quota endpoints belong to the providers and can change shape or refuse a request. An unreadable response is reported as an error rather than a zero. A ChatGPT login that only works for chat replies is refused by OpenAI's usage endpoint, and the plugin says that instead of asking for a new sign-in.
