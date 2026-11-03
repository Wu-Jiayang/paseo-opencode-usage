import { hashAccountKey, type UsageAccount, type UsageScope } from "@getpaseo/plugin/server/usage";
import { discoverCredentials, type OpencodeCredential } from "./opencode-store.js";
import type { CredentialInput } from "../shared/input.js";

export const HARNESS = "OpenCode";

/** The email OpenCode's ChatGPT login carries, when the token exposes one. */
export function credentialLabel(credential: OpencodeCredential): string | undefined {
  if (!credential.access) return undefined;
  const payload = credential.access.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const profile = claims["https://api.openai.com/profile"];
    if (profile && typeof profile === "object") {
      const email = (profile as Record<string, unknown>)["email"];
      if (typeof email === "string" && email) return email;
    }
    const email = claims["email"];
    return typeof email === "string" && email ? email : undefined;
  } catch {
    return undefined;
  }
}

/** The provider part of a model id, which is the integration OpenCode stored it under. */
function modelIntegration(model: string | undefined): string | undefined {
  if (!model) return undefined;
  return model.split("/")[0];
}

/**
 * The store an agent session runs under is the agent's own environment. The
 * daemon's environment fills in whatever the agent did not override.
 */
function sessionEnv(scope: Extract<UsageScope, { kind: "session" }>): NodeJS.ProcessEnv {
  return { ...process.env, ...scope.env };
}

export async function discoverAccounts(
  integrations: CredentialInput["integration"][],
  scope: UsageScope,
): Promise<UsageAccount[]> {
  const wanted =
    scope.kind === "session"
      ? integrations.filter((integration) => integration === modelIntegration(scope.model))
      : integrations;
  if (!wanted.length) return [];

  const env = scope.kind === "session" ? sessionEnv(scope) : process.env;
  const accounts: UsageAccount[] = [];
  for (const integration of wanted) {
    for (const credential of await discoverCredentials(integration, env)) {
      const label = credentialLabel(credential);
      accounts.push({
        key: hashAccountKey(`${integration}:${credential.id}`),
        harness: HARNESS,
        input: { integration, credentialId: credential.id },
        ...(label ? { label } : {}),
      });
    }
  }
  return accounts;
}
