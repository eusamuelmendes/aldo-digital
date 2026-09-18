"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/cardapio", label: "Cardápio" },
  { href: "/admin/mesas", label: "Mesas" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return <>{children}</>;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="admin-container">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0" }}>
        <div className="brand">
          Aldo Digital
          <small>Painel administrativo</small>
        </div>
        <button className="btn-ghost" onClick={handleLogout}>Sair</button>
      </header>
      <nav className="admin-nav">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
