import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { discoverCredentials, opencodeStorePaths, readDatabaseCredentials } from "./opencode-store.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencode-usage-"));
});

afterEach(async () => {
  await import("node:fs/promises").then(({ rm }) => rm(home, { recursive: true, force: true }));
});

async function database(path: string) {
  await mkdir(dirname(path), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE credential (id TEXT PRIMARY KEY, integration_id TEXT, label TEXT, value TEXT, connector_id TEXT, method_id TEXT, active INTEGER, time_created INTEGER, time_updated INTEGER)",
  );
  return db;
}

function oauthValue(access: string, expires: number, accountId?: string) {
  return JSON.stringify({
    type: "oauth",
    methodID: "chatgpt-headless",
    access,
    refresh: "fixture-refresh",
    expires,
    ...(accountId ? { metadata: { accountID: accountId } } : {}),
  });
}

function insertRow(
  db: ReturnType<typeof database> extends Promise<infer T> ? T : never,
  id: string,
  integration: string,
  value: string,
  active: number | null = 1,
) {
  db.prepare("INSERT INTO credential VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    integration,
    integration,
    value,
    null,
    "method",
    active,
    1,
    1,
  );
}

test("reads the active OpenAI login from the OpenCode database", async () => {
  const path = join(home, ".local", "share", "opencode", "opencode.db");
  const db = await database(path);
  insertRow(db, "cred_1", "openai", oauthValue("fixture-access", 2000, "account-1"));
  db.close();

  const credentials = await discoverCredentials("openai", { HOME: home });
  expect(credentials).toEqual([
    {
      id: "cred_1",
      integration: "openai",
      access: "fixture-access",
      refresh: "fixture-refresh",
      expires: 2000,
      accountId: "account-1",
    },
  ]);
});

test("reads a migrated login whose active flag was never set", async () => {
  const path = join(home, ".local", "share", "opencode", "opencode.db");
  const db = await database(path);
  insertRow(db, "cred_1", "openai", oauthValue("fixture-access", 2000, "account-1"), null);
  db.close();

  const credentials = await discoverCredentials("openai", { HOME: home });
  expect(credentials.map((credential) => credential.id)).toEqual(["cred_1"]);
});

test("skips a login that was explicitly deactivated", async () => {
  const path = join(home, ".local", "share", "opencode", "opencode.db");
  const db = await database(path);
  insertRow(db, "cred_1", "openai", oauthValue("fixture-access", 2000), 0);
  db.close();

  expect(await discoverCredentials("openai", { HOME: home })).toEqual([]);
});

test("the database wins over a stale file login for the same integration", async () => {
  const dataHome = join(home, ".local", "share");
  const path = join(dataHome, "opencode", "opencode.db");
  const db = await database(path);
  insertRow(db, "cred_1", "openai", oauthValue("fixture-access", 2000, "account-1"));
  db.close();
  await mkdir(join(dataHome, "opencode"), { recursive: true });
  await writeFile(
    join(dataHome, "opencode", "auth.json"),
    JSON.stringify({ openai: { type: "oauth", access: "file-access", expires: 500 } }),
  );

  const credentials = await discoverCredentials("openai", { HOME: home });
  expect(credentials.map((credential) => credential.access)).toEqual(["fixture-access"]);
});

test("a file login survives for an integration the database never received", async () => {
  const dataHome = join(home, ".local", "share");
  const path = join(dataHome, "opencode", "opencode.db");
  const db = await database(path);
  insertRow(db, "cred_1", "openai", oauthValue("fixture-access", 2000, "account-1"));
  db.close();
  await mkdir(join(dataHome, "opencode"), { recursive: true });
  await writeFile(
    join(dataHome, "opencode", "auth.json"),
    JSON.stringify({ deepseek: { type: "api", key: "file-key" } }),
  );

  const credentials = await discoverCredentials("deepseek", { HOME: home });
  expect(credentials).toEqual([{ id: "deepseek", integration: "deepseek", key: "file-key" }]);
});

test("resolves a relative OPENCODE_DB inside the OpenCode data directory", () => {
  expect(opencodeStorePaths({ HOME: home })).toEqual({
    file: join(home, ".local", "share", "opencode", "auth.json"),
    database: join(home, ".local", "share", "opencode", "opencode.db"),
  });
  expect(opencodeStorePaths({ HOME: home, OPENCODE_DB: "custom.db" }).database).toBe(
    join(home, ".local", "share", "opencode", "custom.db"),
  );
  expect(opencodeStorePaths({ HOME: home, OPENCODE_DB: "/tmp/absolute.db" }).database).toBe(
    "/tmp/absolute.db",
  );
});

test("a database without the credential table is not a credential store", async () => {
  const path = join(home, ".local", "share", "opencode", "opencode.db");
  await mkdir(dirname(path), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE session (id TEXT PRIMARY KEY)");
  db.close();

  expect(readDatabaseCredentials(path)).toEqual([]);
});
