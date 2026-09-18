"use client";

import { useEffect, useState } from "react";

type TableRow = { id: string; number: number; label: string | null; isActive: boolean; qrUrl: string };

export default function AdminMesasPage() {
  const [tablesRows, setTablesRows] = useState<TableRow[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tables")
      .then((r) => r.json())
      .then((d) => setTablesRows(d.tables));
  }, []);

  async function copy(row: TableRow) {
    try {
      await navigator.clipboard.writeText(row.qrUrl);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard indisponível — o link já está visível na tela
    }
  }

  if (!tablesRows) return <p style={{ color: "var(--ink-soft)" }}>Carregando...</p>;

  return (
    <div>
      <h3 style={{ marginBottom: 6, fontSize: "1.1rem" }}>Links de mesa (QR Code)</h3>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.84rem", marginBottom: 16 }}>
        Cada link é assinado e único por mesa. Gere o QR Code de cada URL (qualquer gerador de QR
        serve) e imprima para a mesa correspondente.
      </p>
      <table className="admin-table">
        <thead>
          <tr><th>Mesa</th><th>Link</th><th></th></tr>
        </thead>
        <tbody>
          {tablesRows.map((row) => (
            <tr key={row.id}>
              <td>{row.number}{row.label ? ` (${row.label})` : ""}</td>
              <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: "0.78rem" }}>
                {row.qrUrl}
              </td>
              <td><button className="btn-sm btn-ghost" onClick={() => copy(row)}>{copiedId === row.id ? "copiado!" : "copiar"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
