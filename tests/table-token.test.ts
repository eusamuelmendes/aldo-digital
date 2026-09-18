/**
 * Testes do token de mesa (segurança do QR Code — item 8 do briefing).
 *
 * Prova o requisito: "implemente segurança para evitar que qualquer pessoa
 * consiga manipular a mesa simplesmente alterando a URL".
 */

import { describe, it, expect } from "vitest";
import {
  createTableToken,
  verifyTableToken,
  generateQrSecret,
  TableTokenError,
} from "../src/lib/table-token";

const APP_SECRET = "segredo-de-teste-0123456789abcdef";

const mesa03 = { id: "t_003", number: 3, qrSecret: generateQrSecret() };
const mesa08 = { id: "t_008", number: 8, qrSecret: generateQrSecret() };

const tables = new Map([
  [mesa03.id, mesa03],
  [mesa08.id, mesa08],
]);

const resolve = async (id: string) => tables.get(id)?.qrSecret ?? null;

describe("token de mesa", () => {
  it("gera e valida o token da própria mesa", async () => {
    const token = createTableToken(mesa03, APP_SECRET);
    const payload = await verifyTableToken(token, APP_SECRET, resolve);

    expect(payload.t).toBe("t_003");
    expect(payload.n).toBe(3);
  });

  it("não expõe o número da mesa em texto puro na URL", () => {
    const token = createTableToken(mesa08, APP_SECRET);
    // O payload é base64url, então "mesa/08" não aparece de forma editável
    expect(token).not.toContain("t_008");
    expect(token.split(".")).toHaveLength(2);
  });

  it("rejeita payload adulterado (trocar a mesa na URL)", async () => {
    const token = createTableToken(mesa03, APP_SECRET);
    const [, signature] = token.split(".");

    // Atacante monta um payload apontando para a mesa 8 e reaproveita a
    // assinatura da mesa 3.
    const forjado = Buffer.from(
      JSON.stringify({ t: "t_008", n: 8, v: 1 }),
      "utf8",
    ).toString("base64url");

    await expect(
      verifyTableToken(`${forjado}.${signature}`, APP_SECRET, resolve),
    ).rejects.toThrow(TableTokenError);
  });

  it("rejeita token de uma mesa usado como se fosse de outra", async () => {
    const tokenMesa3 = createTableToken(mesa03, APP_SECRET);
    const payload = await verifyTableToken(tokenMesa3, APP_SECRET, resolve);
    // Continua sendo a mesa 3, não há como "virar" a 8
    expect(payload.t).toBe("t_003");
    expect(payload.t).not.toBe("t_008");
  });

  it("rejeita assinatura inválida", async () => {
    const token = createTableToken(mesa03, APP_SECRET);
    const [payload] = token.split(".");
    await expect(
      verifyTableToken(`${payload}.assinaturafalsa`, APP_SECRET, resolve),
    ).rejects.toThrow(/inválida/i);
  });

  it("rejeita token gerado com outro segredo de aplicação", async () => {
    const token = createTableToken(mesa03, "outro-segredo-qualquer");
    await expect(verifyTableToken(token, APP_SECRET, resolve)).rejects.toThrow(
      /inválida/i,
    );
  });

  it("rejeita mesa inexistente sem revelar que ela não existe", async () => {
    const fantasma = { id: "t_999", number: 999, qrSecret: generateQrSecret() };
    const token = createTableToken(fantasma, APP_SECRET);
    await expect(verifyTableToken(token, APP_SECRET, resolve)).rejects.toThrow(
      /Assinatura inválida/,
    );
  });

  it("rejeita token malformado", async () => {
    for (const bad of ["", "abc", "a.b.c", "....", "semponto"]) {
      await expect(verifyTableToken(bad, APP_SECRET, resolve)).rejects.toThrow(
        TableTokenError,
      );
    }
  });

  it("permite girar o QR de uma mesa sem afetar as outras", async () => {
    const tokenAntigo = createTableToken(mesa08, APP_SECRET);
    await expect(
      verifyTableToken(tokenAntigo, APP_SECRET, resolve),
    ).resolves.toBeTruthy();

    // Bar troca o segredo daquela mesa (QR reimpresso)
    tables.set(mesa08.id, { ...mesa08, qrSecret: generateQrSecret() });

    await expect(
      verifyTableToken(tokenAntigo, APP_SECRET, resolve),
    ).rejects.toThrow(/inválida/i);

    // A mesa 3 continua funcionando normalmente
    const tokenMesa3 = createTableToken(mesa03, APP_SECRET);
    await expect(
      verifyTableToken(tokenMesa3, APP_SECRET, resolve),
    ).resolves.toBeTruthy();
  });
});
