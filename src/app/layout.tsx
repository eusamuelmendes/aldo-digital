import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/lib/cart-store";

export const metadata = {
  title: "Bar do Aldo",
  description: "Cardápio digital e pedidos do Bar do Aldo",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17110d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
