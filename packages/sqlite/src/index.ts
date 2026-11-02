import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Context, Schema } from "yumeri";
import { SqlDatabase } from "@mirelia/database-core";

export interface SqliteConfig {
  path: string;
}

export const depend: string[] = [];
export const provide = ["database"];

export const config: Schema<SqliteConfig> = Schema.object({
  path: Schema.string("SQLite database path").key("sqlite.path").default("./data/mirelia.db"),
});

function normalizeParams(params: unknown[]) {
  return params.map((value) => value instanceof Date ? value.toISOString() : typeof value === "boolean" ? Number(value) : value);
}

export async function apply(ctx: Context, pluginConfig: SqliteConfig = { path: "./data/mirelia.db" }) {
  const file = path.resolve(pluginConfig.path || "./data/mirelia.db");
  await mkdir(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  const database = new SqlDatabase({
    dialect: "sqlite",
    async execute(sql, params = []) {
      const result = raw.prepare(sql).run(...normalizeParams(params) as never[]);
      return { changes: Number(result.changes), insertId: result.lastInsertRowid };
    },
    async one(sql, params = []) {
      return raw.prepare(sql).get(...normalizeParams(params) as never[]) as Record<string, unknown> | undefined;
    },
    async many(sql, params = []) {
      return raw.prepare(sql).all(...normalizeParams(params) as never[]) as Record<string, unknown>[];
    },
    async close() { raw.close(); },
  });
  ctx.registerComponent("database", database);
  ctx.affect(() => database.close());
}

export default apply;
