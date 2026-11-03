import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

export interface OpencodeCredential {
  id: string;
  integration: string;
  key?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
}

interface Database {
  prepare(sql: string): { all(...args: string[]): unknown[] };
  close(): void;
}

interface Sqlite {
  DatabaseSync: new (path: string, options: { readOnly: boolean }) => Database;
}

const oauthValueSchema = z.object({
  type: z.literal("oauth"),
  access: z.string().min(1),
  refresh: z.string().optional(),
  expires: z.number().optional(),
  accountId: z.string().optional(),
  metadata: z
    .object({ accountID: z.string().optional(), enterpriseUrl: z.string().optional() })
    .optional(),
});

const keyValueSchema = z.object({
  type: z.union([z.literal("key"), z.literal("api")]),
  key: z.string().min(1),
});

const credentialValueSchema = z.union([oauthValueSchema, keyValueSchema]);
const rowSchema = z.object({ id: z.string(), value: z.string() });
const fileEntrySchema = z.object({
  type: z.string().optional(),
  key: z.string().optional(),
  access: z.string().optional(),
  refresh: z.string().optional(),
  expires: z.number().optional(),
  accountId: z.string().optional(),
});

export function opencodeStorePaths(env: NodeJS.ProcessEnv = process.env): {
  file: string;
  database: string;
} {
  const dataHome = env.XDG_DATA_HOME || join(env.HOME || homedir(), ".local", "share");
  const directory = join(dataHome, "opencode");
  return {
    file: join(directory, "auth.json"),
    // OpenCode resolves a relative OPENCODE_DB inside its own data directory.
    database: resolve(directory, env.OPENCODE_DB || "opencode.db"),
  };
}

function builtinSqlite(): Sqlite | undefined {
  const parsed = z
    .object({
      DatabaseSync: z.custom<Sqlite["DatabaseSync"]>((value) => typeof value === "function"),
    })
    .safeParse(process.getBuiltinModule?.("node:sqlite"));
  return parsed.success ? parsed.data : undefined;
}

function parseCredential(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

/**
 * OpenCode v2 keeps every credential in its database and leaves the v1 file
 * untouched, so a file login can be stale while the database login is current.
 */
export function readDatabaseCredentials(path: string): OpencodeCredential[] {
  const sqlite = builtinSqlite();
  if (!sqlite || !existsSync(path)) return [];
  let db: Database | undefined;
  try {
    db = new sqlite.DatabaseSync(path, { readOnly: true });
    const columns = db
      .prepare("PRAGMA table_info(credential)")
      .all()
      .map((value) => z.object({ name: z.string() }).safeParse(value));
    if (!columns.some((column) => column.success && column.data.name === "integration_id")) {
      return [];
    }
    const rows = db
      .prepare(
        // Migrated v1 rows carry no active flag. OpenCode keeps the newest
        // created login until an explicit selection pins another one.
        "SELECT id, value, integration_id FROM credential WHERE active = 1 OR active IS NULL ORDER BY active DESC, time_created DESC, id DESC",
      )
      .all();
    return rows.flatMap((value) => {
      const row = z.object({ id: z.string(), value: z.string(), integration_id: z.string() }).safeParse(value);
      if (!row.success) return [];
      const credential = credentialValueSchema.safeParse(parseCredential(row.data.value));
      if (!credential.success) return [];
      return [toCredential(row.data.id, row.data.integration_id, credential.data)];
    });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

export async function readFileCredentials(path: string): Promise<OpencodeCredential[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
  const parsed = z.record(z.string(), fileEntrySchema).safeParse(raw);
  if (!parsed.success) return [];
  return Object.entries(parsed.data).flatMap(([integration, entry]) => {
    const credential = credentialValueSchema.safeParse(entry);
    if (!credential.success) return [];
    return [toCredential(integration, integration, credential.data)];
  });
}

function toCredential(
  id: string,
  integration: string,
  value: z.infer<typeof credentialValueSchema>,
): OpencodeCredential {
  if (value.type === "oauth") {
    const accountId = value.accountId ?? value.metadata?.accountID;
    return {
      id,
      integration,
      access: value.access,
      ...(value.refresh ? { refresh: value.refresh } : {}),
      ...(value.expires !== undefined ? { expires: value.expires } : {}),
      ...(accountId ? { accountId } : {}),
    };
  }
  return { id, integration, key: value.key };
}

/**
 * The database wins for an integration it knows about, because the v1 file is
 * the store that goes stale. An integration the database never received keeps
 * its file login.
 */
export async function discoverCredentials(
  integration: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpencodeCredential[]> {
  const { file, database } = opencodeStorePaths(env);
  const fromDatabase = readDatabaseCredentials(database).filter(
    (credential) => credential.integration === integration,
  );
  if (fromDatabase.length) return fromDatabase;
  return (await readFileCredentials(file)).filter(
    (credential) => credential.integration === integration,
  );
}

export async function readCredential(
  integration: string,
  credentialId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpencodeCredential | null> {
  const credentials = await discoverCredentials(integration, env);
  return credentials.find((credential) => credential.id === credentialId) ?? null;
}
