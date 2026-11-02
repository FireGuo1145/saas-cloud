import { Pool, type PoolConfig } from "pg";
import { Context, Schema } from "yumeri";
import { SqlDatabase } from "@mirelia/database-core";

export interface PgsqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  max: number;
}

export const depend: string[] = [];
export const provide = ["database"];

export const config: Schema<PgsqlConfig> = Schema.object({
  host: Schema.string("PostgreSQL host").key("pgsql.host").default("127.0.0.1"),
  port: Schema.number("PostgreSQL port").key("pgsql.port").default(5432),
  user: Schema.string("PostgreSQL user").key("pgsql.user").default("postgres"),
  password: Schema.string("PostgreSQL password").key("pgsql.password").default(""),
  database: Schema.string("PostgreSQL database").key("pgsql.database").default("mirelia"),
  ssl: Schema.boolean("Use PostgreSQL TLS").key("pgsql.ssl").default(false),
  max: Schema.number("Maximum pool connections").key("pgsql.max").default(10),
});

function placeholders(sql: string) {
  let index = 0;
  let output = "";
  let single = false;
  let double = false;
  for (let offset = 0; offset < sql.length; offset += 1) {
    const char = sql[offset];
    if (char === "'" && !double) single = !single;
    else if (char === '"' && !single) double = !double;
    if (char === "?" && !single && !double) output += `$${++index}`;
    else output += char;
  }
  return output;
}

function poolConfig(value: PgsqlConfig): PoolConfig {
  return {
    host: value.host,
    port: value.port,
    user: value.user,
    password: value.password,
    database: value.database,
    max: value.max,
    ssl: value.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

export async function apply(ctx: Context, pluginConfig: PgsqlConfig = {
  host: "127.0.0.1",
  port: 5432,
  user: "postgres",
  password: "",
  database: "mirelia",
  ssl: false,
  max: 10,
}) {
  const pool = new Pool(poolConfig(pluginConfig));
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  const database = new SqlDatabase({
    dialect: "pgsql",
    async execute(sql, params = []) {
      const result = await pool.query(placeholders(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    async one(sql, params = []) {
      const result = await pool.query(placeholders(sql), params);
      return result.rows[0] as Record<string, unknown> | undefined;
    },
    async many(sql, params = []) {
      const result = await pool.query(placeholders(sql), params);
      return result.rows as Record<string, unknown>[];
    },
    close: () => pool.end(),
  });

  ctx.registerComponent("database", database);
  ctx.affect(() => database.close());
}

export default apply;
