import postgres from "postgres";
import { loadEnv } from "@/lib/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Conexão única com o banco.
 *
 * Em desenvolvimento o Next recarrega os módulos a cada alteração; sem o cache
 * global cada reload abriria um novo pool até o Postgres recusar conexões.
 */
const globalForDb = globalThis as unknown as {
  sql: ReturnType<typeof postgres> | undefined;
};

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurado. Veja .env.example.");
}

export const sql =
  globalForDb.sql ??
  postgres(connectionString, {
    // Em serverless o pool precisa ser pequeno: cada instância abre o seu.
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
