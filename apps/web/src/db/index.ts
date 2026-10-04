import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { getConfig } from "../config";
const globals = globalThis as typeof globalThis & { sahaayPool?: Pool };
export function getPool() {
  if (!globals.sahaayPool) {
    globals.sahaayPool = new Pool({
      connectionString: getConfig().DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
    });
    globals.sahaayPool.on("error", () =>
      console.error("Database connection unavailable"),
    );
  }
  return globals.sahaayPool;
}
export function getDb() {
  return drizzle(getPool(), { schema });
}
