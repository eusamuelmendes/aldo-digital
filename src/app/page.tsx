import Link from "next/link";

/**
 * Home mínima do sistema (Fase 2-5). O site institucional continua sendo
 * o artifact separado; esta home serve o app de pedidos em si.
 */
export default function Home() {
  return (
    <div className="container" style={{ paddingTop: 60, textAlign: "center" }}>
      <div className="brand" style={{ marginBottom: 30, justifyContent: "center", display: "flex", flexDirection: "column" }}>
        Bar do Aldo
        <small>Aldo Digital</small>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 280, margin: "0 auto" }}>
        <Link href="/cardapio" className="btn">Ver cardápio e pedir</Link>
        <Link href="/admin/login" className="btn-ghost">Painel administrativo</Link>
      </div>
    </div>
  );
}
