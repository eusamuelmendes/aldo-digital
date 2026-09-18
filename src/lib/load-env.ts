import { readFileSync, existsSync } from "node:fs";

/**
 * Carrega .env quando o código roda fora do Next (scripts, seed, testes).
 * Dentro do Next isso é no-op: o framework já carregou as variáveis.
 * Sem dependência externa (dotenv) para manter o projeto enxuto.
 */
let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2];
      }
    }
  }
}
