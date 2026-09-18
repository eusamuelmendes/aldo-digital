import { Suspense } from "react";
import CardapioClient from "./cardapio-client";

// force-dynamic: o cardápio vem do banco a cada visita, nunca de cache estático
export const dynamic = "force-dynamic";

export default function CardapioPage() {
  return (
    <Suspense fallback={<div className="container" style={{ paddingTop: 40 }}>Carregando...</div>}>
      <CardapioClient />
    </Suspense>
  );
}
