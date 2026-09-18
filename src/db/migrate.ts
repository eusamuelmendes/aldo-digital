/**
 * Aplica as migrations SQL da pasta drizzle/.
 * Usado em desenvolvimento e no deploy (antes de subir a aplicação).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnv } from "@/lib/load-env";

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurado.");

  // max:1 — migrations rodam numa única conexão, em ordem.
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("✓ migrations aplicadas");
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
