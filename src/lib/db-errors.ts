/**
 * Drizzle envolve o erro real do postgres.js dentro de `.cause` (às vezes
 * aninhado mais de um nível). O código 23503 é o código padrão do Postgres
 * para violação de chave estrangeira — checar por ele é mais confiável do
 * que procurar um texto específico na mensagem, que muda dependendo de
 * onde o erro foi envolvido.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      if ((current as { code?: unknown }).code === "23503") return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
